FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Hermes
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy from current directory (apps/agent-api)
COPY pyproject.toml .
COPY app ./app

# Install dependencies including hermes-agent from GitHub
RUN pip install --no-cache-dir -e .

# Railway uses PORT env variable
ENV PORT=8000

EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
