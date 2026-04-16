"""
Multi-Provider AI Client. Drop-in replacement for claude_client.py.
Same invoke_claude() signature — zero callers change.

ENV:
  AI_PROVIDER=claude          # claude | openai | gemini
  AI_MODEL=claude-sonnet-4-20250514  # Any model string

  ANTHROPIC_API_KEY=sk-ant-...   (when provider=claude)
  OPENAI_API_KEY=sk-...          (when provider=openai)
  GOOGLE_API_KEY=AI...           (when provider=gemini)

The 'model' param in invoke_claude (haiku/sonnet) is IGNORED.
All calls go to AI_MODEL.
"""

import json
import logging
import re
from app.config import get_settings

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# ROBUST JSON PARSING — Handles Claude, GPT, and Gemini response formats
# ══════════════════════════════════════════════════════════════════════════════


def parse_json_response(text: str) -> dict:
    """Parse JSON from AI response, handling various formats.

    Handles:
    - Raw JSON (Claude style)
    - Markdown code fences (```json ... ```)
    - Preamble text before JSON
    - Trailing text after JSON
    - Trailing commas in JSON

    Raises:
        json.JSONDecodeError: If no valid JSON found
    """
    if not text or not text.strip():
        raise json.JSONDecodeError("Empty response", text or "", 0)

    original_text = text

    # Step 1: Handle markdown code fences
    # Match ```json ... ``` or ``` ... ```
    fence_pattern = r"```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```"
    fence_match = re.search(fence_pattern, text)
    if fence_match:
        text = fence_match.group(1).strip()

    # Step 2: Remove language identifier if present at start
    if text.startswith("json\n") or text.startswith("JSON\n"):
        text = text[5:]

    # Step 3: Try direct parse first (works for Claude's clean JSON)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Step 4: Try to extract JSON object from text
    # Find first { and last }
    first_brace = text.find("{")
    last_brace = text.rfind("}")

    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        json_candidate = text[first_brace : last_brace + 1]

        # Try parsing the extracted JSON
        try:
            return json.loads(json_candidate)
        except json.JSONDecodeError:
            pass

        # Step 5: Try fixing trailing commas (common GPT/Gemini issue)
        fixed = re.sub(r",\s*([}\]])", r"\1", json_candidate)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

    # Step 6: Try to find JSON array
    first_bracket = text.find("[")
    last_bracket = text.rfind("]")

    if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
        json_candidate = text[first_bracket : last_bracket + 1]
        try:
            result = json.loads(json_candidate)
            # Wrap array in object for consistency
            return {"items": result}
        except json.JSONDecodeError:
            pass

    # Nothing worked - raise with helpful message
    preview = original_text[:200] + "..." if len(original_text) > 200 else original_text
    raise json.JSONDecodeError(
        f"Could not extract valid JSON from response. Preview: {preview}",
        original_text,
        0,
    )


def safe_parse_json(text: str, default: dict = None) -> dict:
    """Safely parse JSON, returning default on failure.

    Args:
        text: Text to parse
        default: Value to return on parse failure (default: empty dict)

    Returns:
        Parsed dict or default value
    """
    if default is None:
        default = {}
    try:
        return parse_json_response(text)
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"JSON parse failed: {e}")
        return default


_claude_client = None
_openai_client = None
_gemini_configured = False


def _get_claude_client():
    global _claude_client
    if _claude_client is None:
        import anthropic

        _claude_client = anthropic.AsyncAnthropic(
            api_key=get_settings().anthropic_api_key
        )
    return _claude_client


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import AsyncOpenAI

        _openai_client = AsyncOpenAI(api_key=get_settings().openai_api_key)
    return _openai_client


def _get_gemini():
    global _gemini_configured
    if not _gemini_configured:
        import google.generativeai as genai

        genai.configure(api_key=get_settings().google_api_key)
        _gemini_configured = True
    import google.generativeai as genai

    return genai


# ══════════════════════════════════════════════════════════════════════════════
# CLAUDE PROVIDER
# ══════════════════════════════════════════════════════════════════════════════


async def _invoke_claude(
    system_prompt, user_message, history, model_id, structured_output
):
    if structured_output:
        return await _claude_structured(
            system_prompt, user_message, history, model_id, structured_output
        )

    client = _get_claude_client()
    system = [
        {"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}
    ]

    messages = []
    if history:
        for i, msg in enumerate(history):
            content = msg.get("content", "")
            if not content:
                continue
            if i == len(history) - 1:
                messages.append(
                    {
                        "role": msg["role"],
                        "content": [
                            {
                                "type": "text",
                                "text": content,
                                "cache_control": {"type": "ephemeral"},
                            }
                        ],
                    }
                )
            else:
                messages.append({"role": msg["role"], "content": content})
    messages.append({"role": "user", "content": user_message})

    response = await client.messages.create(
        model=model_id,
        max_tokens=16384,
        temperature=0.7,
        system=system,
        messages=messages,
    )

    usage = response.usage
    cr = getattr(usage, "cache_read_input_tokens", 0) or 0
    cw = getattr(usage, "cache_creation_input_tokens", 0) or 0
    ti = getattr(usage, "input_tokens", 0) or 0
    if cr > 0 or cw > 0:
        logger.info(
            f"[Claude] model={model_id} input={ti} cached={cr} savings={cr/max(ti+cr,1)*100:.0f}%"
        )
    else:
        logger.info(
            f"[Claude] model={model_id} input={ti} output={usage.output_tokens}"
        )

    return "".join(b.text for b in response.content if b.type == "text")


async def _claude_structured(
    system_prompt, user_message, history, model_id, structured_output
):
    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

    llm = ChatAnthropic(
        model=model_id,
        anthropic_api_key=get_settings().anthropic_api_key,
        max_tokens=16384,
        temperature=0.7,
    )
    msgs = [SystemMessage(content=system_prompt)]
    if history:
        for m in history:
            msgs.append(
                HumanMessage(content=m["content"])
                if m["role"] == "user"
                else AIMessage(content=m["content"])
            )
    msgs.append(HumanMessage(content=user_message))
    return await llm.with_structured_output(structured_output).ainvoke(msgs)


# ══════════════════════════════════════════════════════════════════════════════
# OPENAI PROVIDER — Uses httpx directly to avoid Pydantic serialization bugs
# ══════════════════════════════════════════════════════════════════════════════


async def _invoke_openai(
    system_prompt, user_message, history, model_id, structured_output
):
    """Invoke OpenAI using httpx directly to avoid Pydantic by_alias bugs."""
    import httpx

    settings = get_settings()

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for m in history:
            if m.get("content"):
                messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": model_id,
        "messages": messages,
        "max_tokens": 16384,
        "temperature": 0.7,
    }
    if structured_output:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()

    usage = data.get("usage", {})
    logger.info(
        f"[OpenAI] model={model_id} prompt={usage.get('prompt_tokens', 0)} completion={usage.get('completion_tokens', 0)}"
    )

    return data["choices"][0]["message"]["content"] or ""


# ══════════════════════════════════════════════════════════════════════════════
# GEMINI PROVIDER — Uses dict config to avoid Pydantic serialization bugs
# ══════════════════════════════════════════════════════════════════════════════


async def _invoke_gemini(
    system_prompt, user_message, history, model_id, structured_output
):
    """Invoke Gemini using dict config to avoid Pydantic by_alias bugs."""
    import asyncio

    genai = _get_gemini()

    contents = []
    if history:
        for m in history:
            if m.get("content"):
                contents.append(
                    {
                        "role": "user" if m["role"] == "user" else "model",
                        "parts": [{"text": m["content"]}],
                    }
                )
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    # Use dict instead of GenerationConfig to avoid Pydantic by_alias bug
    # in google-generativeai 0.8.x
    gen_config = {
        "max_output_tokens": 16384,
        "temperature": 0.7,
    }

    gen_model = genai.GenerativeModel(
        model_name=model_id,
        system_instruction=system_prompt,
        generation_config=gen_config,
    )

    result = await asyncio.get_event_loop().run_in_executor(
        None, lambda: gen_model.generate_content(contents).text
    )
    logger.info(f"[Gemini] model={model_id}")
    return result or ""


# ══════════════════════════════════════════════════════════════════════════════
# UNIFIED INTERFACE
# ══════════════════════════════════════════════════════════════════════════════


async def invoke_claude(
    system_prompt: str,
    user_message: str,
    history: list[dict] | None = None,
    model: str = "haiku",
    structured_output: dict | None = None,
) -> str:
    """
    Invoke AI. Routes to AI_PROVIDER with AI_MODEL from env.
    The 'model' param (haiku/sonnet) is ignored — one model for all calls.
    """
    settings = get_settings()
    provider = settings.ai_provider.lower().strip()
    model_id = settings.ai_model.strip()

    if provider == "openai":
        return await _invoke_openai(
            system_prompt, user_message, history, model_id, structured_output
        )
    elif provider == "gemini":
        return await _invoke_gemini(
            system_prompt, user_message, history, model_id, structured_output
        )
    else:
        return await _invoke_claude(
            system_prompt, user_message, history, model_id, structured_output
        )


# ══════════════════════════════════════════════════════════════════════════════
# LANGCHAIN HELPERS (backwards compat)
# ══════════════════════════════════════════════════════════════════════════════


def get_haiku():
    return _get_langchain_model()


def get_sonnet():
    return _get_langchain_model()


def _get_langchain_model():
    settings = get_settings()
    provider = settings.ai_provider.lower().strip()
    model_id = settings.ai_model.strip()

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model_id,
            api_key=settings.openai_api_key,
            max_tokens=16384,
            temperature=0.7,
        )
    elif provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model_id,
            google_api_key=settings.google_api_key,
            max_tokens=16384,
            temperature=0.7,
        )
    else:
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=model_id,
            anthropic_api_key=settings.anthropic_api_key,
            max_tokens=16384,
            temperature=0.7,
        )
