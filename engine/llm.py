"""OpenAI-compatible chat client. LLM_PROVIDER=xai (default) | groq. Raises on failure."""
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

PROVIDER = os.getenv("LLM_PROVIDER", "xai").lower()
_CFG = {
    "xai": ("https://api.x.ai/v1", "XAI_API_KEY"),
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY"),
}
MODEL_NAME = os.getenv("LLM_MODEL") or ""
_client = None


def _pick_model(client) -> str:
    ids = [m.id for m in client.models.list().data]
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
    if _client is None:
        if PROVIDER not in _CFG:
            raise RuntimeError(f"unknown LLM_PROVIDER {PROVIDER}")
        base, key_env = _CFG[PROVIDER]
        key = os.getenv(key_env)
        if not key:
            raise RuntimeError(f"{key_env} missing")
        _client = OpenAI(base_url=base, api_key=key, timeout=180, max_retries=2)
        if not MODEL_NAME:
            MODEL_NAME = _pick_model(_client)
    return _client


def chat(system: str, user: str, json_mode: bool = False) -> str:
    c = _get()
    kw = {"response_format": {"type": "json_object"}} if json_mode else {}
    r = c.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
        **kw,
    )
    out = (r.choices[0].message.content or "").strip()
    if not out:
        raise RuntimeError("empty LLM response")
    return out


if __name__ == "__main__":
    if not os.getenv("LLM_PROVIDER") and os.getenv("GROQ_API_KEY"):
        PROVIDER = "groq"
    print("provider:", PROVIDER)
    print(chat("Reply briefly.", "Say 'canary ok' and nothing else."))
    print("model:", MODEL_NAME)
    print(chat("Return JSON.", 'Return {"ok": true}', json_mode=True))
