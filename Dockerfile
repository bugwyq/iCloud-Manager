FROM node:20-alpine AS web-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY components ./components
COPY hooks ./hooks
COPY lib ./lib
COPY next.config.mjs tsconfig.json ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV ICLOUD_PANEL_PASSWORD=changeme
ENV ICLOUD_PANEL_HOST=0.0.0.0
ENV ICLOUD_PANEL_PORT=17607

COPY dashboard_app ./dashboard_app
COPY start_panel.py ./start_panel.py
COPY --from=web-build /app/out ./out

EXPOSE 17607

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import json, urllib.request; print(json.load(urllib.request.urlopen('http://127.0.0.1:17607/api/session', timeout=3))['ok'])"

CMD ["python", "start_panel.py", "--host", "0.0.0.0", "--port", "17607", "--skip-build", "--no-browser"]
