"""Agent conversation executor — orchestrates LLM, skills, MCP, and repo tools."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import uuid

import httpx
from openhands.sdk import Agent, AgentContext, Conversation
from openhands.sdk.conversation.visualizer import ConversationVisualizerBase
from openhands.tools import get_default_tools

from ..config import settings
from ..core import streams as stream_store
from ..core.streams import TriggerMessage
from ..models.agent import AgentConfig
from ..repositories import conversation_repository
from .builder import build_llm, build_mcp_config, build_skills
from .docker_workspace import docker_sandbox
from .prompt import build_initial_prompt
from .repo_tools import make_repository_tool_specs

logger = logging.getLogger(__name__)


# ─── Custom visualizer ────────────────────────────────────────────────────────


class _QuietVisualizer(ConversationVisualizerBase):
    """No-op visualizer that silently accepts all event types.

    The SDK's DefaultConversationVisualizer emits a WARNING for every event
    type absent from its EVENT_VISUALIZATION_CONFIG (e.g. StreamingDeltaEvent).
    Since this service handles all events via callbacks / token_callbacks, we
    replace the default visualizer with this no-op to eliminate the noise.
    """

    def on_event(self, event) -> None:  # noqa: ANN001
        pass  # all event processing is done in the conversation callbacks


# ─── Repository info helper ───────────────────────────────────────────────────


class RepoInfoSource:
    """Fetches linked repository list from the repository plugin."""

    def __init__(self, plugin_id: str, project_id: str) -> None:
        self.plugin_id = plugin_id
        self.project_id = project_id
        self.repositories: list[dict] = []
        self.clone_url: str | None = None

    def _refresh(self) -> None:
        url = (
            f"{settings.api_base_url}/api/v1/plugins/{self.plugin_id}"
            f"/projects/{self.project_id}/repositories"
        )
        response = httpx.get(url, headers={"X-API-Key": settings.paca_api_key}, timeout=10)
        response.raise_for_status()
        items = response.json().get("data", [])
        if not isinstance(items, list):
            items = []
        self.repositories = items
        self.clone_url = items[0].get("clone_url") if items else None

    def get_repositories(self) -> list[dict]:
        self._refresh()
        return self.repositories


def _gather_repo_sources(trigger: TriggerMessage) -> list[RepoInfoSource]:
    sources = []
    for plugin_id in trigger.repo_plugin_ids:
        source = RepoInfoSource(plugin_id, trigger.project_id)
        try:
            source._refresh()
            if source.repositories:
                sources.append(source)
        except Exception as exc:
            logger.warning("Failed to get repository info from plugin %s: %s", plugin_id, exc)
    return sources


# ─── Shared event index ───────────────────────────────────────────────────────


class _AtomicCounter:
    """Thread-safe monotonic counter shared across event and token callbacks."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._value = 0

    def next(self) -> int:
        with self._lock:
            v = self._value
            self._value += 1
            return v


# ─── Event callback ───────────────────────────────────────────────────────────


def _make_event_callback(
    trigger: TriggerMessage,
    loop: asyncio.AbstractEventLoop,
    counter: _AtomicCounter,
):
    """Return a synchronous callback invoked by the OpenHands SDK on each complete event.

    Agent MessageEvents are skipped here because _make_token_callback captures
    the LLM's text output directly from the streaming response, which gives
    cleaner content without SDK wrapper fields.  All other events (actions,
    observations, system messages) are saved normally.
    """

    def callback(event) -> None:
        event_type = type(event).__name__
        event_source = str(getattr(event, "source", "agent"))

        # Events the frontend never renders — skip to avoid wasting event_index
        # slots and polluting the paginated events list.
        if event_type in {
            "StreamingDeltaEvent",  # streaming chunks (handled by token_callbacks)
            "ConversationStateUpdateEvent",  # internal iteration bookkeeping
            "SystemPromptEvent",  # system prompt echo — not shown to user
            "ConversationErrorEvent",  # SDK error signal — surfaced via conversation status
        }:
            return
        # Agent text responses are captured by token_callbacks with richer
        # streaming data; skip them here to avoid duplicate DB rows.
        if event_type == "MessageEvent" and event_source == "agent":
            return

        event_index = counter.next()
        payload = event.model_dump_json() if hasattr(event, "model_dump_json") else "{}"

        async def _persist():
            await conversation_repository.insert_conversation_event(
                conversation_id=trigger.conversation_id,
                event_type=event_type,
                event_source=event_source,
                event_index=event_index,
                payload=payload,
            )
            await stream_store.publish_event(
                {
                    "conversation_id": trigger.conversation_id,
                    "project_id": trigger.project_id,
                    "event_type": event_type,
                    "event_source": event_source,
                    "event_index": str(event_index),
                    "payload": payload,
                    "status": "running",
                }
            )
            await stream_store.publish_realtime(
                project_id=trigger.project_id,
                conversation_id=trigger.conversation_id,
                event_type=f"agent.{event_type.lower()}",
            )

        future = asyncio.run_coroutine_threadsafe(_persist(), loop)
        try:
            future.result(timeout=10)
        except Exception as exc:
            logger.warning(
                "Event persist failed for conversation %s: %s",
                trigger.conversation_id,
                exc,
            )

    return callback


# ─── Token (streaming) callback ───────────────────────────────────────────────


def _make_token_callback(
    trigger: TriggerMessage,
    loop: asyncio.AbstractEventLoop,
    counter: _AtomicCounter,
):
    """Return a token callback that accumulates streaming LLM chunks into complete
    messages and persists each finished message as a MessageEvent.

    The OpenHands SDK calls this once per streaming chunk.  When finish_reason
    is set the accumulated content is flushed to the database and a realtime
    pub/sub notification is published so WebSocket clients update immediately.
    """
    lock = threading.Lock()
    parts_content: list[str] = []
    parts_reasoning: list[str] = []

    def on_token(stream) -> None:
        for choice in stream.choices:
            delta = choice.delta
            finish_reason = getattr(choice, "finish_reason", None)

            content_chunk = getattr(delta, "content", None) or ""
            reasoning_chunk = getattr(delta, "reasoning_content", None) or ""

            with lock:
                if content_chunk:
                    parts_content.append(content_chunk)
                if reasoning_chunk:
                    parts_reasoning.append(reasoning_chunk)

                if finish_reason:
                    full_content = "".join(parts_content)
                    full_reasoning = "".join(parts_reasoning)
                    parts_content.clear()
                    parts_reasoning.clear()

                    if not full_content and not full_reasoning:
                        return

                    event_index = counter.next()
                    payload_obj: dict = {"content": full_content, "source": "agent"}
                    if full_reasoning:
                        payload_obj["reasoning_content"] = full_reasoning
                    payload_str = json.dumps(payload_obj)

                    async def _persist(idx=event_index, p=payload_str):
                        await conversation_repository.insert_conversation_event(
                            conversation_id=trigger.conversation_id,
                            event_type="MessageEvent",
                            event_source="agent",
                            event_index=idx,
                            payload=p,
                        )
                        await stream_store.publish_event(
                            {
                                "conversation_id": trigger.conversation_id,
                                "project_id": trigger.project_id,
                                "event_type": "MessageEvent",
                                "event_source": "agent",
                                "event_index": str(idx),
                                "payload": p,
                                "status": "running",
                            }
                        )
                        await stream_store.publish_realtime(
                            project_id=trigger.project_id,
                            conversation_id=trigger.conversation_id,
                            event_type="agent.messageevent",
                        )

                    future = asyncio.run_coroutine_threadsafe(_persist(), loop)
                    try:
                        future.result(timeout=10)
                    except Exception as exc:
                        logger.warning(
                            "Token callback persist failed for conversation %s: %s",
                            trigger.conversation_id,
                            exc,
                        )

    return on_token


# ─── Main entry point ─────────────────────────────────────────────────────────


async def run_conversation(trigger: TriggerMessage, agent_config: AgentConfig) -> None:
    """Execute a single agent conversation end-to-end."""
    loop = asyncio.get_event_loop()
    counter = _AtomicCounter()
    logger.info("Starting conversation %s (agent=%s)", trigger.conversation_id, trigger.agent_id)
    await conversation_repository.update_conversation_status(trigger.conversation_id, "running")

    try:
        llm = build_llm(agent_config)
        skills = build_skills(agent_config.skills)
        mcp_config = build_mcp_config(
            agent_config.mcp_servers, agent_config.agent_id, trigger.project_id
        )

        system_suffix = agent_config.system_prompt or ""

        # Documentation workflow — always read project docs first, always write to Paca.
        system_suffix += (
            "\n\n## IMPORTANT: Documentation Workflow\n"
            f"This project's documentation is managed in Paca"
            f" (project ID: `{trigger.project_id}`).\n\n"
            "**Before starting any task**, read the project documentation:\n"
            f"1. Call `list_docs` with `projectId='{trigger.project_id}'`"
            " to see the full documentation tree.\n"
            "2. Call `read_doc` on relevant documents to understand"
            " the project context before proceeding.\n\n"
            "**When writing documentation**, always use the Paca MCP tools"
            " — never create local markdown files:\n"
            "- Call `list_docs` to check whether a document already exists at the intended path.\n"
            "- If it exists: `write_doc` will update it automatically.\n"
            "- If it does not exist: `write_doc` will create it"
            " and any missing folders automatically.\n"
            "- Use paths like `'Architecture/API Design'` — folder structure is handled for you.\n"
        )

        has_repos = len(trigger.repo_plugin_ids) > 0 and agent_config.can_clone_repos
        logger.info(
            "Conversation %s — repo_plugin_ids=%s can_clone_repos=%s has_repos=%s",
            trigger.conversation_id,
            trigger.repo_plugin_ids,
            agent_config.can_clone_repos,
            has_repos,
        )
        if has_repos:
            system_suffix += (
                "\n\n## IMPORTANT: Repository Access & Workflow\n"
                "This project has linked repositories. Follow these steps in order:\n\n"
                "1. Call list_repositories to see available repositories and get their IDs.\n"
                "2. Call clone_repository with the plugin_id and repo_id from step 1.\n"
                "   The repository will be cloned to /workspace/repo (the default target_dir).\n"
                "3. Create a new feature branch before making any changes:\n"
                "   git -C /workspace/repo checkout -b <branch-name>\n"
                "4. Make your code changes, then commit them:\n"
                "   git -C /workspace/repo add -A && git -C /workspace/repo commit -m '<message>'\n"
                "5. Call push_branch with the plugin_id, repo_id,"
                " and the branch name to publish the branch.\n"
                "6. Call create_pull_request with the plugin_id, repo_id, a descriptive title, "
                "the feature branch as head_branch, and the default branch as base_branch.\n\n"
                "Do NOT skip steps 5 and 6 — always push your branch and open a PR when finished."
            )

        agent_context = AgentContext(skills=skills, system_message_suffix=system_suffix)

        def _run_sync() -> None:
            with docker_sandbox(
                trigger.conversation_id,
                git_committer_name=agent_config.git_committer_name,
                git_committer_email=agent_config.git_committer_email,
            ) as workspace:
                agent_kwargs: dict = {"llm": llm, "agent_context": agent_context}
                if mcp_config.get("mcpServers"):
                    agent_kwargs["mcp_config"] = mcp_config

                if has_repos:
                    agent_kwargs["tools"] = get_default_tools() + make_repository_tool_specs(
                        trigger.project_id,
                        trigger.repo_plugin_ids,
                        trigger.task_id,
                        api_base_url=settings.api_base_url,
                        api_key=settings.paca_api_key,
                    )

                agent = Agent(**agent_kwargs)
                # RemoteWorkspace → RemoteConversation; persistence_dir is not
                # supported for remote conversations (state lives in the sandbox).
                conversation = Conversation(
                    agent=agent,
                    workspace=workspace,
                    conversation_id=uuid.UUID(trigger.conversation_id),
                    callbacks=[_make_event_callback(trigger, loop, counter)],
                    token_callbacks=[_make_token_callback(trigger, loop, counter)],
                    max_iteration_per_run=agent_config.max_iterations,
                    visualizer=_QuietVisualizer,
                )

                all_repos_info = None
                if has_repos:
                    try:
                        repo_sources = _gather_repo_sources(trigger)
                        all_repos: list[dict] = []
                        for source in repo_sources:
                            for repo in source.repositories:
                                all_repos.append(
                                    {
                                        "plugin_id": source.plugin_id,
                                        "repo_id": repo["id"],
                                        "full_name": repo["full_name"],
                                        "owner": repo["owner"],
                                        "repo_name": repo["repo_name"],
                                        "clone_url": repo["clone_url"],
                                    }
                                )
                        if all_repos:
                            all_repos_info = all_repos
                    except Exception as exc:
                        logger.warning("Failed to gather repository info: %s", exc)

                conversation.send_message(build_initial_prompt(trigger, all_repos_info))
                conversation.run()

        await asyncio.get_event_loop().run_in_executor(None, _run_sync)
        await conversation_repository.update_conversation_status(
            trigger.conversation_id, "finished"
        )
        await stream_store.publish_realtime(
            project_id=trigger.project_id,
            conversation_id=trigger.conversation_id,
            event_type="agent.conversation.finished",
        )

    except Exception as exc:
        logger.exception("Conversation %s failed: %s", trigger.conversation_id, exc)
        await conversation_repository.update_conversation_status(
            trigger.conversation_id, "failed", error_message=str(exc)
        )
        await stream_store.publish_realtime(
            project_id=trigger.project_id,
            conversation_id=trigger.conversation_id,
            event_type="agent.conversation.failed",
        )
