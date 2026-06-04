"""Valkey / Redis stream client and message types."""

from __future__ import annotations

import json
import logging
import socket
from dataclasses import dataclass
from typing import Any

import redis.asyncio as aioredis

from ..config import settings

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None

TRIGGER_STREAM = "paca:agent:triggers"
EVENTS_STREAM = "paca:agent:events"
# Pub/Sub channel consumed by services/realtime for WebSocket fan-out.
REALTIME_CHANNEL = "paca.events"
CONSUMER_GROUP = "ai-agent-workers"
# Unique per replica so Valkey tracks each instance's PEL separately.
CONSUMER_NAME = f"worker-{socket.gethostname()}"


def get_client() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(settings.valkey_url, decode_responses=True)
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def ensure_consumer_group() -> None:
    """Create the consumer group on the trigger stream if it does not exist."""
    client = get_client()
    try:
        await client.xgroup_create(TRIGGER_STREAM, CONSUMER_GROUP, id="$", mkstream=True)
    except aioredis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise


async def publish_event(fields: dict[str, Any]) -> None:
    """Publish an agent event to the outbound Valkey stream."""
    client = get_client()
    serialized = {k: str(v) for k, v in fields.items()}
    await client.xadd(EVENTS_STREAM, serialized)


async def publish_realtime(
    project_id: str,
    conversation_id: str,
    event_type: str = "agent.conversation.event",
    extra_payload: dict[str, Any] | None = None,
) -> None:
    """Publish directly to the paca.events pub/sub channel so the realtime
    service immediately fans the event out to connected WebSocket clients.

    The realtime service routes any event whose type starts with "agent." to
    the project tasks room (see permissions.ts), so clients invalidate their
    conversation query caches and see new messages without waiting for the
    next poll cycle.
    """
    client = get_client()
    payload: dict[str, Any] = {
        "project_id": project_id,
        "conversation_id": conversation_id,
    }
    if extra_payload:
        payload.update(extra_payload)
    message = json.dumps({"type": event_type, "payload": payload})
    await client.publish(REALTIME_CHANNEL, message)


@dataclass
class TriggerMessage:
    stream_id: str
    trigger_type: str
    conversation_id: str
    agent_id: str
    project_id: str
    task_id: str | None
    comment_id: str | None
    chat_session_id: str | None
    message: str
    actor_member_id: str
    repo_plugin_ids: list[str]

    @classmethod
    def from_stream_entry(cls, stream_id: str, fields: dict[str, str]) -> TriggerMessage:
        repo_plugin_ids_str = fields.get("repo_plugin_ids", "")
        repo_plugin_ids = repo_plugin_ids_str.split(",") if repo_plugin_ids_str else []
        return cls(
            stream_id=stream_id,
            trigger_type=fields["trigger_type"],
            conversation_id=fields["conversation_id"],
            agent_id=fields["agent_id"],
            project_id=fields["project_id"],
            task_id=fields.get("task_id") or None,
            comment_id=fields.get("comment_id") or None,
            chat_session_id=fields.get("chat_session_id") or None,
            message=fields.get("message", ""),
            actor_member_id=fields["actor_member_id"],
            repo_plugin_ids=repo_plugin_ids,
        )


async def read_triggers(count: int = 10, block_ms: int = 2000) -> list[TriggerMessage]:
    """Read new trigger messages from the consumer group."""
    client = get_client()
    try:
        results = await client.xreadgroup(
            CONSUMER_GROUP,
            CONSUMER_NAME,
            {TRIGGER_STREAM: ">"},
            count=count,
            block=block_ms,
        )
    except Exception as exc:
        logger.error("Failed to read from stream: %s", exc)
        return []
    if not results:
        return []
    messages = []
    for _stream, entries in results:
        for stream_id, fields in entries:
            try:
                messages.append(TriggerMessage.from_stream_entry(stream_id, fields))
            except KeyError as e:
                logger.warning("Dropping malformed trigger message %s: missing %s", stream_id, e)
    return messages


async def ack_trigger(stream_id: str) -> None:
    client = get_client()
    await client.xack(TRIGGER_STREAM, CONSUMER_GROUP, stream_id)
