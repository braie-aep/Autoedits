# Build the existing AutoEdit browser UI, then serve it from the Python import API.
FROM node:22-alpine AS frontend
WORKDIR /ui
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM python:3.12-slim AS app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/main.py .
COPY --from=frontend /ui/dist /app/dist
ENV PYTHONUNBUFFERED=1 AUTOEDIT_STATIC_DIR=/app/dist
EXPOSE 8080
CMD ["sh","-c","uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
