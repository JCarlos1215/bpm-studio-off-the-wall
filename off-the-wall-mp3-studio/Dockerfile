FROM node:22-bookworm-slim AS js-runtime
FROM python:3.13-slim-bookworm
COPY --from=js-runtime /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN node --version && node -e "if (+process.versions.node.split('.')[0] < 22) process.exit(1)"
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --uid 10001 --create-home appuser && mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser
ENV HOST=0.0.0.0 PORT=8093 DATA_DIR=/app/data PYTHONUNBUFFERED=1
EXPOSE 8093
CMD ["python", "app.py"]
