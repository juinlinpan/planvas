FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV WHITEBOARD_PLANVAS_ROOT=/data/planvas
ENV WHITEBOARD_BACKEND_ROOT=/data/runtime
ENV WHITEBOARD_FRONTEND_DIST=/app/frontend/dist

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/app.version.json app.version.json
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist

RUN mkdir -p /data/planvas /data/runtime && chown -R node:node /app /data

USER node

EXPOSE 18000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:18000/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "backend/dist/src/server.js", "--host", "0.0.0.0", "--port", "18000", "--mcp-port", "18001"]
