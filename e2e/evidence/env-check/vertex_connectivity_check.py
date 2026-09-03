import os
import time

os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"
os.environ["GOOGLE_CLOUD_PROJECT"] = "oneshot-505907"
os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"

from google import genai

client = genai.Client()
model = os.environ.get("TEST_MODEL", "gemini-2.5-flash")
start = time.time()
response = client.models.generate_content(
    model=model,
    contents="Reply with exactly one word: PONG",
)
elapsed = time.time() - start
text = (response.text or "").strip()
print(f"model={model}")
print(f"latency_seconds={elapsed:.2f}")
print(f"response={text}")
