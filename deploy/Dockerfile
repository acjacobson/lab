FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1     PYTHONUNBUFFERED=1     APP_PORT=8080

WORKDIR /app
COPY pyproject.toml README.md ./
COPY lab ./lab
RUN python -m pip install --no-cache-dir --upgrade pip     && python -m pip install --no-cache-dir .

EXPOSE 8080
CMD ["sh", "-c", "uvicorn lab.app:app --host 0.0.0.0 --port ${APP_PORT:-8080}"]
