"""Shared in-memory registry for active conversations and stop signals."""

from __future__ import annotations

import threading

# Active Conversation objects keyed by conversation_id string.
# Multi-replica note: in a multi-replica deployment pair this with a Valkey key
# (paca:agent:active:{conversation_id}) to route control requests to the owning replica.
active_conversations: dict[str, object] = {}

# threading.Event per conversation_id; set() to signal the polling loop to stop.
stop_events: dict[str, threading.Event] = {}

# threading.Event per conversation_id; set() to signal human approval.
approval_events: dict[str, threading.Event] = {}
# Result of approval (approved/rejected) per conversation_id.
approval_results: dict[str, str] = {}
