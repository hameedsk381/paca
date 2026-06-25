"""Agent semantic memory tools."""

from __future__ import annotations

from collections.abc import Sequence

import httpx
from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import Tool, ToolExecutor, register_tool
from pydantic import Field


# ─── Store Memory ────────────────────────────────────────────────────────────

class StoreMemoryAction(Action):
    """Action to store information in the agent's long-term semantic memory."""

    content: str = Field(description="The detailed content, facts, or instructions to remember.")
    embedding: list[float] = Field(description="1536-dimensional embedding vector representing the content's semantic meaning.")


class StoreMemoryObservation(Observation):
    success: bool = False
    message: str = ""

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        if self.success:
            return [TextContent(text="Memory stored successfully.")]
        return [TextContent(text=f"Failed to store memory: {self.message}")]


class StoreMemoryExecutor(ToolExecutor[StoreMemoryAction, StoreMemoryObservation]):
    def __init__(self, project_id: str, agent_id: str, api_base_url: str, api_key: str) -> None:
        self.project_id = project_id
        self.agent_id = agent_id
        self.api_base_url = api_base_url
        self.api_key = api_key

    def __call__(self, action: StoreMemoryAction, conversation=None) -> StoreMemoryObservation:
        try:
            url = f"{self.api_base_url}/api/v1/projects/{self.project_id}/agents/{self.agent_id}/memories"
            payload = {
                "content": action.content,
                "embedding": action.embedding
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
    ) -> Sequence[ToolDefinition]:
        return [
            cls(
                description="Store important context, preferences, or findings in the agent's long-term memory using vector embeddings.",
                action_type=StoreMemoryAction,
                observation_type=StoreMemoryObservation,
                executor=StoreMemoryExecutor(project_id, agent_id, api_base_url, api_key),
            )
        ]


# ─── Search Memory ───────────────────────────────────────────────────────────

class SearchMemoryAction(Action):
    """Action to search the agent's long-term semantic memory."""

    embedding: list[float] = Field(description="1536-dimensional embedding vector representing the search query.")
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
    def __init__(self, project_id: str, agent_id: str, api_base_url: str, api_key: str) -> None:
        self.project_id = project_id
        self.agent_id = agent_id
        self.api_base_url = api_base_url
        self.api_key = api_key

    def __call__(self, action: SearchMemoryAction, conversation=None) -> SearchMemoryObservation:
        try:
            url = f"{self.api_base_url}/api/v1/projects/{self.project_id}/agents/{self.agent_id}/memories/search"
            payload = {
                "embedding": action.embedding,
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
    ) -> Sequence[ToolDefinition]:
        return [
            cls(
                description="Search the agent's long-term semantic memory for relevant past context or instructions.",
                action_type=SearchMemoryAction,
                observation_type=SearchMemoryObservation,
                executor=SearchMemoryExecutor(project_id, agent_id, api_base_url, api_key),
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
) -> list[Tool]:
    common = {
        "project_id": project_id,
        "agent_id": agent_id,
        "api_base_url": api_base_url,
        "api_key": api_key,
    }
    return [
        Tool(name="store_memory", params=common),
        Tool(name="search_memory", params=common),
    ]
