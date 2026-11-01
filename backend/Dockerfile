FROM python:3.14-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Fixtures fictícias (transcrições, extrações) ficam na raiz do repositório e são montadas em /fixtures
ENV FIXTURES_DIR=/fixtures

EXPOSE 8000
