from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from ..models import PlannerChatRequest, PlannerChatResponse, PlannerChatStateDelta
from ..planning import build_planner_flow, execute_planner_turn


def run_planner_chat(payload: PlannerChatRequest) -> PlannerChatResponse:
    flow = build_planner_flow()
    return flow.invoke(payload)


async def stream_planner_chat(payload: PlannerChatRequest) -> AsyncIterator[str]:
    queue: asyncio.Queue[dict[str, object] | None] = asyncio.Queue()

    async def emit_reasoning(text: str) -> None:
        await queue.put(
            {
                "type": "reasoning",
                "text": text,
            }
        )

    async def emit_state(state: PlannerChatStateDelta) -> None:
        await queue.put(
            {
                "type": "state",
                "state": state.model_dump(by_alias=True),
            }
        )

    async def worker() -> None:
        try:
            response = await execute_planner_turn(
                payload,
                emit_reasoning=emit_reasoning,
                emit_state=emit_state,
            )
            await queue.put(
                {
                    "type": "response",
                    "response": response.model_dump(by_alias=True),
                }
            )
        except Exception as exc:
            await queue.put(
                {
                    "type": "error",
                    "error": str(exc) or "Unknown planner streaming error",
                }
            )
        finally:
            await queue.put(None)

    task = asyncio.create_task(worker())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"
    finally:
        await task
