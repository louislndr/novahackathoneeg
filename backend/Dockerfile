# Builds the Cloud Run suggestion proxy only (frictionfix.suggestion_proxy:app), not
# the full local backend. See README.md, "Cloud Run suggestion proxy" section.
FROM python:3.13-slim

WORKDIR /app
COPY pyproject.toml ./
COPY frictionfix ./frictionfix

# gemini extra only -- the proxy never touches the EEG/ANT/LSL bridge.
RUN pip install --no-cache-dir ".[gemini]"

EXPOSE 8080
CMD ["sh", "-c", "uvicorn frictionfix.suggestion_proxy:app --host 0.0.0.0 --port ${PORT:-8080}"]
