# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
# The base image already provides a `node` user at UID/GID 1000. We reuse it
# rather than creating our own — Claude Code refuses to run with
# `--dangerously-skip-permissions` as root, so the app runs as `node`.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git openssh-client ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code @openai/codex @google/gemini-cli \
  # Pre-create auth/config dirs so named-volume mounts inherit node ownership.
  && mkdir -p /home/node/.claude /home/node/.codex /home/node/.gemini /home/node/.config \
  && chown -R node:node /home/node /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/home/node

COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts

COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

USER node

# `npm start` forks two processes with `&`; wrap in tini + wait so signals and
# exit codes propagate correctly and the container dies when either process dies.
# The entrypoint script runs git config setup from env vars before the main CMD.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["bash", "-c", "npm run start:next & NEXT_PID=$!; npm run start:daemon & DAEMON_PID=$!; wait -n $NEXT_PID $DAEMON_PID; kill $NEXT_PID $DAEMON_PID 2>/dev/null; exit 1"]
