from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values

REPO_ROOT = Path(__file__).resolve().parents[2]
ROOT_DOTENV_PATH = REPO_ROOT / ".env"


@lru_cache(maxsize=1)
def _load_root_dotenv() -> dict[str, str]:
    if not ROOT_DOTENV_PATH.exists():
        return {}

    values = dotenv_values(ROOT_DOTENV_PATH)
    return {
        key: value.strip()
        for key, value in values.items()
        if isinstance(value, str) and value.strip()
    }


def get_preferred_env_value(name: str) -> str | None:
    root_dotenv = _load_root_dotenv()
    if name in root_dotenv:
        return root_dotenv[name]

    value = os.getenv(name)
    return value.strip() if isinstance(value, str) and value.strip() else None


def get_preferred_google_api_key() -> str | None:
    return (
        get_preferred_env_value("GEMINI_API_KEY")
        or get_preferred_env_value("GOOGLE_API_KEY")
    )
