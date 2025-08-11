FROM node:20-bookworm

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code && \
    apt-get update && apt-get install -y --no-install-recommends dumb-init && \
    rm -rf /var/lib/apt/lists/*

# App files
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js .

ENV PORT=8080
EXPOSE 8080

# Use dumb-init so SIGTERM/SIGINT behave in containers
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
