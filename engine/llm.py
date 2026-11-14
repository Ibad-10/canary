"""OpenAI-compatible chat client. LLM_PROVIDER=xai (default) | groq. Raises on failure."""
import os
import re
import threading
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

try:
    import jiter  # noqa: F401  openai loads it lazily on the first chat call
    from openai import OpenAI
except ImportError:  # e.g. Windows Application Control blocking openai's compiled jiter dependency
    OpenAI = None

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

PROVIDER = os.getenv("LLM_PROVIDER", "xai").lower()
_CFG = {
    "xai": ("https://api.x.ai/v1", "XAI_API_KEY"),
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY"),
}
MODEL_NAME = os.getenv("LLM_MODEL") or ""
_client = None
_lock = threading.Lock()


class _Http:
    """The two OpenAI-compatible calls we use, over plain httpx (used when the openai package cannot load)."""

    def __init__(self, base, key):
        self.base, self.headers = base.rstrip("/"), {"Authorization": f"Bearer {key}"}

    def model_ids(self):
        r = httpx.get(f"{self.base}/models", headers=self.headers, timeout=60)
        r.raise_for_status()
        return [m["id"] for m in r.json()["data"]]

    def complete(self, **body):
        for attempt in range(3):
            try:
                r = httpx.post(f"{self.base}/chat/completions", headers=self.headers, json=body, timeout=180)
                if r.status_code != 429 and r.status_code < 500:
                    break
            except httpx.TransportError:
                if attempt == 2:
                    raise
            time.sleep(2 ** attempt)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


def _pick_model(ids) -> str:
    if PROVIDER == "groq":
        for pat in ("llama-3.3-70b", "llama-3.1-70b", "gpt-oss-120b", "qwen"):
            for i in ids:
                if pat in i:
                    return i
        raise RuntimeError("no suitable groq model")
    vers = [(tuple(map(int, m.groups())), i) for i in ids if (m := re.fullmatch(r"grok-(\d+)\.(\d+)", i))]
    if not vers:
        raise RuntimeError("no grok model available")
    return max(vers)[1]


def _get():
    global _client, MODEL_NAME
    with _lock:  # callers run in threads; publish the client only once the model is chosen
        if _client is None:
            if PROVIDER not in _CFG:
                raise RuntimeError(f"unknown LLM_PROVIDER {PROVIDER}")
            base, key_env = _CFG[PROVIDER]
            key = os.getenv(key_env)
            if not key:
                raise RuntimeError(f"{key_env} missing")
            if OpenAI is not None:
                c = OpenAI(base_url=base, api_key=key, timeout=180, max_retries=2)
                ids = [m.id for m in c.models.list().data] if not MODEL_NAME else []
            else:
                c = _Http(base, key)
                ids = c.model_ids() if not MODEL_NAME else []
            if not MODEL_NAME:
                MODEL_NAME = _pick_model(ids)
            _client = c
    return _client


def chat(system: str, user: str, json_mode: bool = False) -> str:
    c = _get()
    kw = {"response_format": {"type": "json_object"}} if json_mode else {}
    body = dict(model=MODEL_NAME, messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=0.2, **kw)
    if isinstance(c, _Http):
        out = c.complete(**body) or ""
    else:
        out = c.chat.completions.create(**body).choices[0].message.content or ""
    out = out.strip()
    if not out:
        raise RuntimeError("empty LLM response")
    return out


if __name__ == "__main__":
    if not os.getenv("LLM_PROVIDER") and os.getenv("GROQ_API_KEY"):
        PROVIDER = "groq"
    print("provider:", PROVIDER, "client:", "openai" if OpenAI else "httpx")
    print(chat("Reply briefly.", "Say 'canary ok' and nothing else."))
    print("model:", MODEL_NAME)
    print(chat("Return JSON.", 'Return {"ok": true}', json_mode=True))
