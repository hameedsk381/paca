"""Database access layer for agent conversations and events."""

from __future__ import annotations

from ..core.db import get_pool


async def update_conversation_status(
    conversation_id: str,
    status: str,
    error_message: str | None = None,
) -> None:
    pool = await get_pool()
    if error_message is not None:
        await pool.execute(
            (
                "UPDATE agent_conversations"
                " SET status = $1, error_message = $2,"
                " updated_at = now() WHERE id = $3"
            ),
            status,
            error_message,
            conversation_id,
        )
    else:
        await pool.execute(
            "UPDATE agent_conversations SET status = $1, updated_at = now() WHERE id = $2",
            status,
            conversation_id,
        )


async def insert_conversation_event(
    conversation_id: str,
    event_type: str,
    event_source: str,
    event_index: int,
    payload: str,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO agent_conversation_events
            (id, conversation_id, event_type, event_source, event_index, payload, created_at)
        VALUES
            (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, now())
        ON CONFLICT DO NOTHING
        """,
        conversation_id,
        event_type,
        event_source,
        event_index,
        payload,
    )
