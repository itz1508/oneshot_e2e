"""Live probe of the Featherless provider boundary (token + model availability)."""
import json
import os
import time

from openai import OpenAI

model = os.getenv("FEATHERLESS_MODEL", "google/gemma-4-31B-it")
client = OpenAI(
    base_url=os.getenv("FEATHERLESS_API_BASE", "https://api.featherless.ai/v1"),
    api_key=os.environ["FEATHERLESS_API_KEY"],
    timeout=120,
)

report = {"model_arg": model}

try:
    models = client.models.list()
    ids = [m.id for m in models.data]
    report["models_http"] = "OK"
    report["model_count"] = len(ids)
    report["exact_model_available"] = model in ids
    report["glm_models"] = [i for i in ids if "glm" in i.lower()][:12]
    report["deepseek_models"] = [i for i in ids if "deepseek" in i.lower()][:12]
    report["kimi_models"] = [i for i in ids if "kimi" in i.lower() or "moonshot" in i.lower()][:12]
    report["qwen_models"] = [i for i in ids if "qwen" in i.lower()][:15]
    report["gemma_models"] = [i for i in ids if "gemma" in i.lower()][:8]
except Exception as error:  # noqa: BLE001
    report["models_http"] = f"FAIL {type(error).__name__}: {error}"

if report.get("models_http") == "OK":
    start = time.time()
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Reply with exactly one word: PONG"},
                {"role": "user", "content": "Confirm by replying PONG."},
            ],
            temperature=0,
            max_tokens=16,
        )
        report["completion_http"] = "OK"
        report["completion_seconds"] = round(time.time() - start, 2)
        report["completion_text"] = (completion.choices[0].message.content or "").strip()[:80]
    except Exception as error:  # noqa: BLE001
        report["completion_http"] = f"FAIL {type(error).__name__}: {error}"

print(json.dumps(report, indent=2))
