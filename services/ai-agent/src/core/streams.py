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


# Trigger types that carry a conversation run request.
_TRIGGER_TYPES = {
    "agent.task_assigned",
    "agent.comment_mention",
    "agent.chat_message",
}

# Control message types that direct an *existing* conversation.
# agent.approval.resolved is a control directive (it carries no run request and
# has none of the trigger fields like agent_id/actor_member_id), so it must be
# routed to the worker's control handler rather than parsed as a TriggerMessage.
_CONTROL_TYPES = {
    "agent.stop",
    "agent.approval.resolved",
}


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


@dataclass
class ControlMessage:
    """A control directive for an already-running conversation.

    Covers ``agent.stop`` and ``agent.approval.resolved``.  The api service
    publishes these as flat stream fields, so ``status`` is read from the
    top-level entry (not a nested payload) and is only present for approval
    resolutions.
    """

    stream_id: str
    control_type: str  # e.g. "agent.stop", "agent.approval.resolved"
    conversation_id: str
    project_id: str
    status: str | None = None  # set for "agent.approval.resolved"

    @classmethod
    def from_stream_entry(cls, stream_id: str, fields: dict[str, str]) -> ControlMessage:
        return cls(
            stream_id=stream_id,
            control_type=fields["type"],
            conversation_id=fields["conversation_id"],
            project_id=fields["project_id"],
            status=fields.get("status") or None,
        )


async def read_triggers(
    count: int = 10, block_ms: int = 2000
) -> list[TriggerMessage | ControlMessage]:
    """Read new messages from the consumer group.

    Returns a mixed list: run-requests are ``TriggerMessage`` instances;
    stop directives are ``ControlMessage`` instances.
    """
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
    messages: list[TriggerMessage | ControlMessage] = []
    for _stream, entries in results:
        for stream_id, fields in entries:
            msg_type = fields.get("type", "")
            if msg_type in _CONTROL_TYPES:
                try:
                    messages.append(ControlMessage.from_stream_entry(stream_id, fields))
                except KeyError as e:
                    logger.warning(
                        "Dropping malformed control message %s: missing %s", stream_id, e
                    )
            elif msg_type in _TRIGGER_TYPES or "trigger_type" in fields:
                try:
                    messages.append(TriggerMessage.from_stream_entry(stream_id, fields))
                except KeyError as e:
                    logger.warning(
                        "Dropping malformed trigger message %s: missing %s", stream_id, e
                    )
            else:
                logger.warning(
                    "Dropping unrecognised stream message %s (type=%r)", stream_id, msg_type
                )
    return messages


async def ack_trigger(stream_id: str) -> None:
    client = get_client()
    await client.xack(TRIGGER_STREAM, CONSUMER_GROUP, stream_id)


async def recover_orphaned_triggers(min_idle_time_ms: int = 3600000) -> int:
    """Reclaim and acknowledge trigger messages that have been stuck in PEL.
    
    This handles the case where a worker crashes or is restarted while processing
    a conversation. The un-acked message remains in the Pending Entries List (PEL).
    Since conversations are not safely resumable mid-flight, we simply acknowledge
    stuck messages to clear the stream queue. The UI/database will have treated
    these timed-out runs as failed.
    """
    client = get_client()
    recovered_count = 0
    start_id = "0-0"
    while True:
        try:
            result = await client.xautoclaim(
                TRIGGER_STREAM,
                CONSUMER_GROUP,
                CONSUMER_NAME,
                min_idle_time=min_idle_time_ms,
                start_id=start_id,
                count=100,
            )
            next_id = result[0]
            messages = result[1]
            
            for msg in messages:
                # Handle both (msg_id, fields) and msg_id formats across redis-py versions
                msg_id = msg[0] if isinstance(msg, (list, tuple)) else msg
                await ack_trigger(msg_id)
                recovered_count += 1
                
            if next_id == "0-0" or next_id == b"0-0" or not messages:
                break
            start_id = next_id
        except Exception as exc:
            logger.error("Failed to recover orphaned triggers: %s", exc)
            break
            
    if recovered_count > 0:
        logger.info("Recovered and acknowledged %d orphaned triggers", recovered_count)
    return recovered_count
