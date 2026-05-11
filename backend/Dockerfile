# Backend Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (for asyncpg, bcrypt, postgresql-client)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment
ENV PYTHONPATH=/app
ENV PYTHONIOENCODING=utf-8
ENV LANG=ru_RU.UTF-8

# Expose port
EXPOSE 8000

# Run migrations and start app with retry
CMD ["sh", "-c", "for i in 1 2 3 4 5; do alembic -c alembic.ini upgrade heads && break || sleep 5; done && uvicorn main:app --host 0.0.0.0 --port 8000 --log-config logging_config.yaml"]
