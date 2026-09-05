from __future__ import annotations

import os
import sys

try:
    from google import genai
except Exception as exc:
    raise SystemExit(
        "ROOT_CAUSE: google-genai is not importable. "
        "Install repository Python requirements first. "
        f"detail={type(exc).__name__}: {exc}"
    )

project = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
location = os.getenv("GOOGLE_CLOUD_LOCATION", "global").strip() or "global"

models = [
    os.getenv("GEMINI_DISTRIBUTION_MODEL", "gemini-3.5-flash-lite").strip(),
    os.getenv("GEMINI_RESEARCH_MODEL", "gemini-3.6-flash").strip(),
    os.getenv("GEMINI_SYNTHESIS_MODEL", "gemini-3.7-flash").strip(),
]

if not project:
    raise SystemExit("ROOT_CAUSE: GOOGLE_CLOUD_PROJECT is required.")

if any(not model for model in models):
    raise SystemExit("ROOT_CAUSE: all three Gemini model bindings are required.")

if len(set(models)) != 3:
    raise SystemExit("ROOT_CAUSE: the three Gemini bindings must be distinct.")

try:
    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
    )
except Exception as exc:
    raise SystemExit(
        "ROOT_CAUSE: unable to construct Vertex AI GenAI client from ADC. "
        f"detail={type(exc).__name__}: {exc}"
    )

for index, model in enumerate(models, start=1):
    try:
        response = client.models.generate_content(
            model=model,
            contents=(
                "Return exactly this token and nothing else: "
                f"ONESHOT_MODEL_{index}_OK"
            ),
        )
    except Exception as exc:
        raise SystemExit(
            f"ROOT_CAUSE: live Vertex model request failed model={model} "
            f"detail={type(exc).__name__}: {exc}"
        )

    text = (response.text or "").strip()
    print(
        f"LIVE_MODEL_PROBE model={model} "
        f"response={text[:160]!r}",
        flush=True,
    )

print(
    "THREE_DISTINCT_VERTEX_GEMINI_CALLS=PASSED "
    + "->".join(models),
    flush=True,
)
