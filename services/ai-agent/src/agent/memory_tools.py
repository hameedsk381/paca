"""Agent semantic memory tools.

The agent stores and recalls long-term memories by *text*; the embedding vector
is computed here (server-side) with a dedicated embedding model.  A chat LLM
cannot produce a meaningful embedding, so the model must never be asked to emit
one — it only ever provides natural-language content or a query.

All memories share a single 1536-dim pgvector column, so a single, consistent
embedding model must be used for both storing and searching (mixing models
would make cosine similarity meaningless).  That model is configured once at the
service level and threaded in through tool params.
"""

from __future__ import annotations

from collections.abc import Sequence

import httpx
from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import Tool, ToolExecutor, register_tool
from pydantic import Field


def _embed_text(text: str, *, model: str, api_key: str, base_url: str) -> list[float]:
    """Compute an embedding vector for ``text`` using litellm.

    Raises on failure so the caller can surface a clear error to the agent.
    """
    import litellm  # noqa: PLC0415

    kwargs: dict = {"model": model, "input": [text]}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["api_base"] = base_url
    resp = litellm.embedding(**kwargs)
    return resp["data"][0]["embedding"]


# ─── Store Memory ────────────────────────────────────────────────────────────

class StoreMemoryAction(Action):
    """Action to store information in the agent's long-term semantic memory."""

    content: str = Field(description="The detailed content, facts, or instructions to remember.")


class StoreMemoryObservation(Observation):
    success: bool = False
    message: str = ""

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        if self.success:
            return [TextContent(text="Memory stored successfully.")]
        return [TextContent(text=f"Failed to store memory: {self.message}")]


class StoreMemoryExecutor(ToolExecutor[StoreMemoryAction, StoreMemoryObservation]):
    def __init__(
        self,
        project_id: str,
        agent_id: str,
        api_base_url: str,
        api_key: str,
        embedding_model: str,
        embedding_api_key: str,
        embedding_base_url: str,
    ) -> None:
        self.project_id = project_id
        self.agent_id = agent_id
        self.api_base_url = api_base_url
        self.api_key = api_key
        self.embedding_model = embedding_model
        self.embedding_api_key = embedding_api_key
        self.embedding_base_url = embedding_base_url

    def __call__(self, action: StoreMemoryAction, conversation=None) -> StoreMemoryObservation:
        try:
            embedding = _embed_text(
                action.content,
                model=self.embedding_model,
                api_key=self.embedding_api_key,
                base_url=self.embedding_base_url,
            )
        except Exception as exc:
            return StoreMemoryObservation(success=False, message=f"could not embed content: {exc}")
        try:
            url = f"{self.api_base_url}/api/v1/projects/{self.project_id}/agents/{self.agent_id}/memories"
            payload = {
                "content": action.content,
                "embedding": embedding,
            }
            resp = httpx.post(
                url,
                headers={"X-API-Key": self.api_key, "Content-Type": "application/json"},
                json=payload,
                timeout=10,
            )
            resp.raise_for_status()
            return StoreMemoryObservation(success=True)
        except Exception as exc:
            return StoreMemoryObservation(success=False, message=str(exc))


class StoreMemoryTool(ToolDefinition[StoreMemoryAction, StoreMemoryObservation]):
    @classmethod
    def create(
        cls,
        conv_state=None,
        *,
        project_id: str,
        agent_id: str,
        api_base_url: str,
        api_key: str,
        embedding_model: str,
        embedding_api_key: str = "",
        embedding_base_url: str = "",
    ) -> Sequence[ToolDefinition]:
        return [
            cls(
                description="Store important context, preferences, or findings in the agent's long-term memory. Provide the text to remember; the embedding is computed for you.",
                action_type=StoreMemoryAction,
                observation_type=StoreMemoryObservation,
                executor=StoreMemoryExecutor(
                    project_id,
                    agent_id,
                    api_base_url,
                    api_key,
                    embedding_model,
                    embedding_api_key,
                    embedding_base_url,
                ),
            )
        ]


# ─── Search Memory ───────────────────────────────────────────────────────────

class SearchMemoryAction(Action):
    """Action to search the agent's long-term semantic memory."""

    query: str = Field(description="Natural-language description of the context or information to recall.")
    limit: int = Field(default=5, description="Maximum number of memories to return.")


class SearchMemoryObservation(Observation):
    success: bool = False
    memories: list[dict] = Field(default_factory=list)
    message: str = ""

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        if not self.success:
            return [TextContent(text=f"Failed to search memories: {self.message}")]
        if not self.memories:
            return [TextContent(text="No relevant memories found.")]

        lines = ["Relevant memories found:"]
        for idx, mem in enumerate(self.memories, 1):
            lines.append(f"\n{idx}. {mem.get('content')}")

        return [TextContent(text="\n".join(lines))]


class SearchMemoryExecutor(ToolExecutor[SearchMemoryAction, SearchMemoryObservation]):
    def __init__(
        self,
        project_id: str,
        agent_id: str,
        api_base_url: str,
        api_key: str,
        embedding_model: str,
        embedding_api_key: str,
        embedding_base_url: str,
    ) -> None:
        self.project_id = project_id
        self.agent_id = agent_id
        self.api_base_url = api_base_url
        self.api_key = api_key
        self.embedding_model = embedding_model
        self.embedding_api_key = embedding_api_key
        self.embedding_base_url = embedding_base_url

    def __call__(self, action: SearchMemoryAction, conversation=None) -> SearchMemoryObservation:
        try:
            embedding = _embed_text(
                action.query,
                model=self.embedding_model,
                api_key=self.embedding_api_key,
                base_url=self.embedding_base_url,
            )
        except Exception as exc:
            return SearchMemoryObservation(success=False, message=f"could not embed query: {exc}")
        try:
            url = f"{self.api_base_url}/api/v1/projects/{self.project_id}/agents/{self.agent_id}/memories/search"
            payload = {
                "embedding": embedding,
                "limit": action.limit,
            }
            resp = httpx.post(
                url,
                headers={"X-API-Key": self.api_key, "Content-Type": "application/json"},
                json=payload,
                timeout=10,
            )
            resp.raise_for_status()

            data = resp.json()
            return SearchMemoryObservation(success=True, memories=data.get("data", []))
        except Exception as exc:
            return SearchMemoryObservation(success=False, message=str(exc))


class SearchMemoryTool(ToolDefinition[SearchMemoryAction, SearchMemoryObservation]):
    @classmethod
    def create(
        cls,
        conv_state=None,
        *,
        project_id: str,
        agent_id: str,
        api_base_url: str,
        api_key: str,
        embedding_model: str,
        embedding_api_key: str = "",
        embedding_base_url: str = "",
    ) -> Sequence[ToolDefinition]:
        return [
            cls(
                description="Search the agent's long-term semantic memory for relevant past context or instructions. Provide a natural-language query.",
                action_type=SearchMemoryAction,
                observation_type=SearchMemoryObservation,
                executor=SearchMemoryExecutor(
                    project_id,
                    agent_id,
                    api_base_url,
                    api_key,
                    embedding_model,
                    embedding_api_key,
                    embedding_base_url,
                ),
            )
        ]

register_tool("store_memory", StoreMemoryTool)
register_tool("search_memory", SearchMemoryTool)

def make_memory_tool_specs(
    project_id: str,
    agent_id: str,
    *,
    api_base_url: str,
    api_key: str,
    embedding_model: str,
    embedding_api_key: str = "",
    embedding_base_url: str = "",
) -> list[Tool]:
    common = {
        "project_id": project_id,
        "agent_id": agent_id,
        "api_base_url": api_base_url,
        "api_key": api_key,
        "embedding_model": embedding_model,
        "embedding_api_key": embedding_api_key,
        "embedding_base_url": embedding_base_url,
    }
    return [
        Tool(name="store_memory", params=common),
        Tool(name="search_memory", params=common),
    ]
