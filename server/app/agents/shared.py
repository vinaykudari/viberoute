from __future__ import annotations

import os

import railtracks as rt

from ..env import get_preferred_env_value, get_preferred_google_api_key

def normalize_google_env() -> None:
    preferred_key = get_preferred_google_api_key()
    if preferred_key:
        os.environ["GEMINI_API_KEY"] = preferred_key
        os.environ.pop("GOOGLE_API_KEY", None)


def has_live_llm() -> bool:
    return bool(get_preferred_google_api_key())


def mark_llm_unavailable() -> None:
    return None


def get_viberoute_llm():
    normalize_google_env()
    model_name = get_preferred_env_value("VIBEROUTE_AGENT_MODEL") or (
        "gemini-3.1-flash-lite-preview"
    )
    return rt.llm.GeminiLLM(model_name)
