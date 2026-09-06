FROM python:3.12-slim

WORKDIR /app/backend/python

COPY backend/python/pyproject.toml ./
COPY backend/python/app ./app
COPY backend/schema/reasoning /app/backend/schema/reasoning

RUN pip install --no-cache-dir -e .

EXPOSE 8000

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
