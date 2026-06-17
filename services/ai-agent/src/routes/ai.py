"""AI-powered feature endpoints for Paca Phase 1.

Provides instant LLM-powered assist for task descriptions, task generation,
and conversation summaries — without triggering a full agent conversation.
"""

from __future__ import annotations

import json
import logging
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..core.db import get_pool

logger = logging.getLogger(__name__)


def _require_internal_key(x_internal_token: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_internal_token, settings.internal_api_key):
        raise HTTPException(status_code=401, detail="Unauthorized")


router = APIRouter(prefix="/ai", dependencies=[Depends(_require_internal_key)])


# --- Request/response models -------------------------------------------------


class AssistTaskRequest(BaseModel):
    project_id: str
    title: str
    agent_id: str | None = None


class AssistTaskResponse(BaseModel):
    description: str
    acceptance_criteria: list[str]
    technical_approach: str | None = None
    suggested_labels: list[str] = []


class GenerateTasksRequest(BaseModel):
    project_id: str
    prompt: str
    agent_id: str | None = None


class GeneratedTask(BaseModel):
    title: str
    description: str | None = None
    priority: str | None = None  # high | medium | low
    labels: list[str] = []


class GenerateTasksResponse(BaseModel):
    tasks: list[GeneratedTask]


class ConversationSummaryResponse(BaseModel):
    summary: str
    key_decisions: list[str] = []
    files_changed: list[str] = []
    status: str | None = None


# --- Internal helpers ---------------------------------------------------------


async def _load_agent_config(agent_id: str) -> dict | None:
    """Load LLM config for a specific agent from the database."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, llm_provider, llm_model, llm_api_key_secret, llm_base_url
        FROM agents WHERE id = $1 AND deleted_at IS NULL
        """,
        agent_id,
    )
    if row is None:
        return None
    return {
        "agent_id": str(row["id"]),
        "llm_provider": row["llm_provider"],
        "llm_model": row["llm_model"],
        "llm_api_key_secret": row["llm_api_key_secret"] or "",
        "llm_base_url": row["llm_base_url"] or "",
    }


async def _load_first_agent(project_id: str) -> dict | None:
    """Load the first enabled agent for a project."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, llm_provider, llm_model, llm_api_key_secret, llm_base_url
        FROM agents WHERE project_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 1
        """,
        project_id,
    )
    if row is None:
        return None
    return {
        "agent_id": str(row["id"]),
        "llm_provider": row["llm_provider"],
        "llm_model": row["llm_model"],
        "llm_api_key_secret": row["llm_api_key_secret"] or "",
        "llm_base_url": row["llm_base_url"] or "",
    }


def _decrypt_secret(ciphertext: str) -> str:
    """Decrypt AES-256-GCM ciphertext — mirrors agent_repository._decrypt_secret."""
    if not ciphertext:
        return ciphertext
    if not settings.encryption_key:
        return ciphertext
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        key = bytes.fromhex(settings.encryption_key)
        raw = __import__("base64").b64decode(ciphertext)
        nonce_size = 12
        nonce, ct_with_tag = raw[:nonce_size], raw[nonce_size:]
        return AESGCM(key).decrypt(nonce, ct_with_tag, None).decode()
    except Exception:
        logger.exception("Failed to decrypt LLM API key")
        return ""


def _build_llm_call_params(agent_config: dict, messages: list[dict], temperature: float = 0.7) -> dict:
    """Build parameters for a litellm completion call from agent config."""
    provider = agent_config["llm_provider"]
    model = agent_config["llm_model"]
    base_url = agent_config["llm_base_url"] or None
    api_key = _decrypt_secret(agent_config["llm_api_key_secret"])

    params: dict = {
        "model": f"{provider}/{model}",
        "messages": messages,
        "temperature": temperature,
    }
    if api_key:
        params["api_key"] = api_key
    if base_url:
        params["api_base"] = base_url
    return params


def _determine_model_string(agent_config: dict) -> str:
    """Build a model string compatible with litellm.

    For providers with a custom base_url that litellm doesn't natively know,
    route through the OpenAI-compatible client.
    """
    import litellm  # noqa: PLC0415

    provider = agent_config["llm_provider"]
    model = agent_config["llm_model"]
    base_url = agent_config["llm_base_url"] or None

    if base_url and provider not in litellm.provider_list:
        return f"openai/{model}"
    return f"{provider}/{model}"


async def _call_llm(
    agent_config: dict,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> str:
    """Call the LLM via litellm with the given messages.

    litellm is already a transitive dependency of openhands-sdk.
    """
    import litellm  # noqa: PLC0415

    model_str = _determine_model_string(agent_config)
    api_key = _decrypt_secret(agent_config["llm_api_key_secret"])
    base_url = agent_config["llm_base_url"] or None

    kwargs: dict = {
        "model": model_str,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["api_base"] = base_url

    try:
        response = await litellm.acompletion(**kwargs)
        return response.choices[0].message.content or ""
    except Exception as exc:
        logger.exception("LLM call failed for model %s", model_str)
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}")


async def _resolve_agent(project_id: str, agent_id: str | None) -> dict:
    """Resolve the agent config, preferring a specific agent or falling back to the first project agent."""
    if agent_id:
        config = await _load_agent_config(agent_id)
        if config is None:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
        return config
    config = await _load_first_agent(project_id)
    if config is None:
        raise HTTPException(
            status_code=400,
            detail="No AI agents configured for this project. Create an agent first.",
        )
    return config


# --- Endpoints ----------------------------------------------------------------


@router.post("/assist-task", response_model=AssistTaskResponse)
async def assist_task(body: AssistTaskRequest):
    """Smart Task Descriptions — generate description, AC, and approach from a title."""
    agent_config = await _resolve_agent(body.project_id, body.agent_id)

    system_prompt = (
        "You are a senior software engineer and product manager. "
        "Given a task title, produce a structured set of task details. "
        "Respond with valid JSON only — no markdown, no code fences. "
        "Use this exact shape:\n"
        '{"description": "...", "acceptance_criteria": ["..."], "technical_approach": "...", "suggested_labels": ["..."]}'
    )
    user_prompt = f"Task title: {body.title}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = await _call_llm(agent_config, messages, temperature=0.5)
    try:
        parsed = json.loads(raw)
        return AssistTaskResponse(
            description=parsed.get("description", ""),
            acceptance_criteria=parsed.get("acceptance_criteria", []),
            technical_approach=parsed.get("technical_approach"),
            suggested_labels=parsed.get("suggested_labels", []),
        )
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse LLM response as JSON, returning raw: %s", raw[:200])
        return AssistTaskResponse(
            description=raw,
            acceptance_criteria=[],
        )


@router.post("/generate-tasks", response_model=GenerateTasksResponse)
async def generate_tasks(body: GenerateTasksRequest):
    """Task Auto-Generation — break down a natural language prompt into structured tasks."""
    agent_config = await _resolve_agent(body.project_id, body.agent_id)

    system_prompt = (
        "You are a senior project manager and software architect. "
        "Given a natural language feature description, break it down into structured tasks. "
        "Respond with valid JSON only — no markdown, no code fences. "
        "Use this exact shape:\n"
        '{"tasks": [{"title": "...", "description": "...", "priority": "high|medium|low", "labels": ["..."]}]}'
    )
    user_prompt = f"Feature description: {body.prompt}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = await _call_llm(agent_config, messages, temperature=0.6, max_tokens=3000)
    try:
        parsed = json.loads(raw)
        tasks_data = parsed.get("tasks", [])
        tasks = [
            GeneratedTask(
                title=t.get("title", ""),
                description=t.get("description"),
                priority=t.get("priority"),
                labels=t.get("labels", []),
            )
            for t in tasks_data
        ]
        return GenerateTasksResponse(tasks=tasks)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse LLM response as JSON: %s", raw[:200])
        raise HTTPException(status_code=502, detail="LLM returned invalid JSON")


# ── Phase 2: AI Code Review on PRs ─────────────────────────────────────────


class CodeReviewRequest(BaseModel):
    project_id: str
    conversation_id: str


class CodeReviewIssue(BaseModel):
    severity: str  # critical | major | minor | suggestion
    file: str
    line: int | None = None
    description: str
    suggestion: str | None = None


class CodeReviewResponse(BaseModel):
    summary: str
    issues: list[CodeReviewIssue] = []
    positive_feedback: list[str] = []
    overall_score: str | None = None  # pass | pass_with_suggestions | needs_changes


@router.post("/conversations/{conversation_id}/review", response_model=CodeReviewResponse)
async def code_review(conversation_id: UUID):
    """AI Code Review — review a PR created during an agent conversation."""
    pool = await get_pool()

    # Fetch the conversation to get PR URL and project info.
    conv_row = await pool.fetchrow(
        """
        SELECT id, agent_id, project_id, pr_url, branch_name, status
        FROM agent_conversations WHERE id = $1
        """,
        str(conversation_id),
    )
    if conv_row is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    pr_url = conv_row["pr_url"]
    if not pr_url:
        raise HTTPException(status_code=400, detail="No PR associated with this conversation")

    # Fetch the agent config for LLM calling.
    agent_id = str(conv_row["agent_id"])
    agent_config = await _load_agent_config(agent_id)
    if agent_config is None:
        raise HTTPException(status_code=400, detail="Agent configuration not available")

    # Fetch events to understand what was done (for context).
    event_rows = await pool.fetch(
        """
        SELECT event_type, event_source, payload, created_at
        FROM agent_conversation_events
        WHERE conversation_id = $1
        ORDER BY event_index ASC
        LIMIT 100
        """,
        str(conversation_id),
    )
    event_summary_lines: list[str] = []
    for row in event_rows:
        ev_type = row["event_type"]
        payload_raw = row["payload"]
        try:
            payload = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw
        except (json.JSONDecodeError, TypeError):
            payload = {}
        content = ""
        if isinstance(payload, dict):
            content = payload.get("content", "") or payload.get("message", "") or ""
        if isinstance(content, str) and len(content) > 200:
            content = content[:200] + "..."
        line = f"[{ev_type}] {content}" if content else f"[{ev_type}]"
        event_summary_lines.append(line)

    event_context = "\n".join(event_summary_lines[-30:])  # Last 30 events for context

    system_prompt = (
        "You are a senior code reviewer. Review the code changes in this PR and provide "
        "structured feedback. Focus on correctness, security, performance, and best practices. "
        "Respond with valid JSON only — no markdown, no code fences. "
        "Use this exact shape:\n"
        '{"summary": "...", '
        '"issues": [{"severity": "critical|major|minor|suggestion", "file": "...", "line": null, "description": "...", "suggestion": "..."}], '
        '"positive_feedback": ["..."], '
        '"overall_score": "pass|pass_with_suggestions|needs_changes"}'
    )
    user_prompt = (
        f"PR URL: {pr_url}\n"
        f"Branch: {conv_row['branch_name'] or 'unknown'}\n\n"
        f"Conversation event context:\n{event_context}\n\n"
        "Review the code changes in this PR. Focus on the diff and provide actionable feedback."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = await _call_llm(agent_config, messages, temperature=0.3, max_tokens=2000)
    try:
        parsed = json.loads(raw)
        issues_data = parsed.get("issues", [])
        issues = [
            CodeReviewIssue(
                severity=i.get("severity", "minor"),
                file=i.get("file", ""),
                line=i.get("line"),
                description=i.get("description", ""),
                suggestion=i.get("suggestion"),
            )
            for i in issues_data
        ]
        return CodeReviewResponse(
            summary=parsed.get("summary", "No summary provided."),
            issues=issues,
            positive_feedback=parsed.get("positive_feedback", []),
            overall_score=parsed.get("overall_score"),
        )
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse LLM response as JSON: %s", raw[:200])
        return CodeReviewResponse(summary=raw, overall_score="needs_changes")


# ── Phase 2: Natural Language Queries ──────────────────────────────────────


class NLQueryRequest(BaseModel):
    project_id: str
    query: str


class NLQueryFilter(BaseModel):
    field: str
    operator: str  # eq | neq | contains | gt | gte | lt | lte | in | not_in
    value: str | list[str] | int | float | None = None


class NLQueryResponse(BaseModel):
    interpretation: str
    filters: list[NLQueryFilter] = []
    sort_by: str | None = None
    sort_order: str | None = None  # asc | desc
    summary: str | None = None


@router.post("/nl-query", response_model=NLQueryResponse)
async def nl_query(body: NLQueryRequest):
    """Natural Language Queries — translate a natural language query into task filter params."""
    agent_config = await _resolve_agent(body.project_id, None)

    system_prompt = (
        "You are a query translator for a project management system. "
        "Translate natural language queries into structured filter parameters. "
        "Available fields: status, assignee, priority (importance), type, sprint, labels, "
        "created_at, due_date, story_points, epic.\n"
        "Available operators: eq, neq, contains, gt, gte, lt, lte, in, not_in.\n"
        "Respond with valid JSON only — no markdown, no code fences. "
        "Use this exact shape:\n"
        '{"interpretation": "...", '
        '"filters": [{"field": "...", "operator": "eq", "value": "..."}], '
        '"sort_by": null, "sort_order": null, '
        '"summary": "A concise answer to the query based on the filters"}'
    )
    user_prompt = f"User query: {body.query}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = await _call_llm(agent_config, messages, temperature=0.2, max_tokens=1000)
    try:
        parsed = json.loads(raw)
        filters_data = parsed.get("filters", [])
        filters = [
            NLQueryFilter(
                field=f.get("field", ""),
                operator=f.get("operator", "eq"),
                value=f.get("value"),
            )
            for f in filters_data
        ]
        return NLQueryResponse(
            interpretation=parsed.get("interpretation", ""),
            filters=filters,
            sort_by=parsed.get("sort_by"),
            sort_order=parsed.get("sort_order"),
            summary=parsed.get("summary"),
        )
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse LLM response as JSON: %s", raw[:200])
        raise HTTPException(status_code=502, detail="LLM returned invalid JSON")


# ── Phase 2: Intelligent Error Recovery ────────────────────────────────────


class ErrorAnalysisRequest(BaseModel):
    project_id: str
    conversation_id: str


class SuggestedAction(BaseModel):
    type: str  # retry | adjust_timeout | change_agent | escalate | fix_config
    description: str
    label: str
    params: dict = {}


class ErrorAnalysisResponse(BaseModel):
    error_type: str  # timeout | permission | code_error | infrastructure | unknown
    error_summary: str
    root_cause: str | None = None
    suggested_actions: list[SuggestedAction] = []
    can_auto_retry: bool = False


@router.post("/conversations/{conversation_id}/error-analysis", response_model=ErrorAnalysisResponse)
async def error_analysis(conversation_id: UUID):
    """Intelligent Error Recovery — analyze a failed conversation and suggest fixes."""
    pool = await get_pool()

    conv_row = await pool.fetchrow(
        """
        SELECT id, agent_id, project_id, status, error_message, iteration_count,
               started_at, finished_at
        FROM agent_conversations WHERE id = $1
        """,
        str(conversation_id),
    )
    if conv_row is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv_row["status"] not in ("failed", "stopped"):
        raise HTTPException(status_code=400, detail="Conversation has not failed")

    # Fetch all events for analysis.
    event_rows = await pool.fetch(
        """
        SELECT event_type, event_source, payload, created_at
        FROM agent_conversation_events
        WHERE conversation_id = $1
        ORDER BY event_index ASC
        LIMIT 150
        """,
        str(conversation_id),
    )

    event_log_lines: list[str] = []
    for row in event_rows:
        ev_type = row["event_type"]
        ev_source = row["event_source"]
        payload_raw = row["payload"]
        try:
            payload = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw
        except (json.JSONDecodeError, TypeError):
            payload = {}
        content = ""
        if isinstance(payload, dict):
            content = payload.get("content", "") or payload.get("message", "") or ""
            # Extract error-like fields
            for key in ("error", "error_message", "error_code", "exception", "stderr"):
                val = payload.get(key)
                if val and isinstance(val, str):
                    content = f"{key}: {val[:200]}"
                    break
        if isinstance(content, str) and len(content) > 300:
            content = content[:300] + "..."
        line = f"[{ev_type}:{ev_source}] {content}" if content else f"[{ev_type}:{ev_source}]"
        event_log_lines.append(line)

    event_log = "\n".join(event_log_lines[-100:])  # Last 100 events
    error_msg = conv_row["error_message"] or "No error message recorded"

    agent_config = await _load_agent_config(str(conv_row["agent_id"]))
    if agent_config is None:
        raise HTTPException(status_code=400, detail="Agent configuration not available")

    system_prompt = (
        "You are an AI operations engineer specializing in debugging agent failures. "
        "Analyze the failed conversation and classify the error, identify the root cause, "
        "and suggest recovery actions. "
        "Respond with valid JSON only — no markdown, no code fences. "
        "Use this exact shape:\n"
        '{"error_type": "timeout|permission|code_error|infrastructure|unknown", '
        '"error_summary": "...", '
        '"root_cause": "...", '
        '"suggested_actions": [{"type": "retry|adjust_timeout|change_agent|escalate|fix_config", '
        '"description": "...", "label": "Retry", "params": {}}], '
        '"can_auto_retry": false}'
    )
    user_prompt = (
        f"Conversation status: {conv_row['status']}\n"
        f"Error message: {error_msg}\n"
        f"Iteration count: {conv_row['iteration_count']}\n\n"
        f"Event log (last {len(event_log_lines)} events):\n{event_log}\n\n"
        "Analyze what went wrong and suggest recovery actions."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = await _call_llm(agent_config, messages, temperature=0.2, max_tokens=1500)
    try:
        parsed = json.loads(raw)
        actions_data = parsed.get("suggested_actions", [])
        actions = [
            SuggestedAction(
                type=a.get("type", "escalate"),
                description=a.get("description", ""),
                label=a.get("label", "Retry"),
                params=a.get("params", {}),
            )
            for a in actions_data
        ]
        return ErrorAnalysisResponse(
            error_type=parsed.get("error_type", "unknown"),
            error_summary=parsed.get("error_summary", ""),
            root_cause=parsed.get("root_cause"),
            suggested_actions=actions,
            can_auto_retry=parsed.get("can_auto_retry", False),
        )
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse LLM response as JSON: %s", raw[:200])
        return ErrorAnalysisResponse(
            error_type="unknown",
            error_summary=raw,
            can_auto_retry=False,
        )


@router.get("/conversations/{conversation_id}/summary", response_model=ConversationSummaryResponse)
async def conversation_summary(conversation_id: UUID):
    """Conversation Summaries — summarize agent conversation events."""
    pool = await get_pool()

    # Fetch the conversation metadata.
    conv_row = await pool.fetchrow(
        """
        SELECT id, agent_id, project_id, status, created_at, finished_at
        FROM agent_conversations WHERE id = $1
        """,
        str(conversation_id),
    )
    if conv_row is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Fetch all events in chronological order (limit to avoid huge context).
    event_rows = await pool.fetch(
        """
        SELECT event_type, event_source, payload, created_at
        FROM agent_conversation_events
        WHERE conversation_id = $1
        ORDER BY event_index ASC
        LIMIT 200
        """,
        str(conversation_id),
    )

    if not event_rows:
        return ConversationSummaryResponse(summary="No events recorded for this conversation.")

    # Build a condensed event log for the LLM.
    event_log_lines: list[str] = []
    for row in event_rows:
        ev_type = row["event_type"]
        ev_source = row["event_source"]
        payload_raw = row["payload"]
        try:
            if isinstance(payload_raw, str):
                payload = json.loads(payload_raw)
            else:
                payload = payload_raw
        except (json.JSONDecodeError, TypeError):
            payload = {}

        content = ""
        if isinstance(payload, dict):
            content = payload.get("content", "") or payload.get("message", "") or ""

        # Truncate long content for the summary prompt.
        if isinstance(content, str) and len(content) > 300:
            content = content[:300] + "..."

        line = f"[{ev_type}:{ev_source}] {content}" if content else f"[{ev_type}:{ev_source}]"
        event_log_lines.append(line)

    event_log = "\n".join(event_log_lines)
    status = conv_row["status"]

    # Load the agent config for LLM calling.
    agent_id = str(conv_row["agent_id"])
    agent_config = await _load_agent_config(agent_id)
    if agent_config is None:
        return ConversationSummaryResponse(
            summary="Conversation agent configuration not available.",
            status=status,
        )

    system_prompt = (
        "You are a technical writer summarizing an AI agent's work session. "
        "Given a log of events from an agent conversation, produce a concise summary. "
        "Respond with valid JSON only — no markdown, no code fences. "
        "Use this exact shape:\n"
        '{"summary": "...", "key_decisions": ["..."], "files_changed": ["..."]}'
    )
    user_prompt = (
        f"Agent conversation status: {status}\n\n"
        f"Event log:\n{event_log}\n\n"
        "Summarize what the agent did, key decisions made, and files changed."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    raw = await _call_llm(agent_config, messages, temperature=0.3, max_tokens=1000)
    try:
        parsed = json.loads(raw)
        return ConversationSummaryResponse(
            summary=parsed.get("summary", raw),
            key_decisions=parsed.get("key_decisions", []),
            files_changed=parsed.get("files_changed", []),
            status=status,
        )
    except (json.JSONDecodeError, TypeError):
        return ConversationSummaryResponse(summary=raw, status=status)
