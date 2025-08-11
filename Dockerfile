FROM node:20-bookworm

# Install Claude Code CLI globally and Python tools
RUN npm install -g @anthropic-ai/claude-code && \
    apt-get update && apt-get install -y --no-install-recommends dumb-init python3-pip && \
    rm -rf /var/lib/apt/lists/* && \
    pip3 install --break-system-packages uv

# App files
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js .

ENV PORT=8888
EXPOSE 8888

# Use dumb-init so SIGTERM/SIGINT behave in containers
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
