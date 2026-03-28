from __future__ import annotations

import railtracks as rt

from .shared import get_viberoute_llm


def build_intake_coordinator_agent():
    return rt.agent_node(
        "VibeRoute Intake Coordinator",
        llm=get_viberoute_llm(),
        system_message=(
            "You are the VibeRoute planner intake coordinator. "
            "You summarize the inferred vibe from uploaded images, mention relevant weather "
            "tradeoffs, and ask at most one blocking question at a time before route generation. "
            "Keep replies concise, concrete, and operational."
        ),
    )


def build_plan_explainer_agent():
    return rt.agent_node(
        "VibeRoute Plan Explainer",
        llm=get_viberoute_llm(),
        system_message=(
            "You explain route decisions for VibeRoute. "
            "Describe how vibe, time sensitivity, and weather affected the chosen order. "
            "Keep replies brief and focused on the day plan."
        ),
    )
