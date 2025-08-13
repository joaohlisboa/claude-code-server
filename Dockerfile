FROM node:20-alpine

# Install dependencies in a single layer with cleanup
RUN apk add --no-cache dumb-init python3 py3-pip && \
    npm install -g @anthropic-ai/claude-code && \
    pip3 install --break-system-packages uv && \
    npm cache clean --force

# App files
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js verboseFormatter.js ./

ENV PORT=8888
EXPOSE 8888

# Use dumb-init so SIGTERM/SIGINT behave in containers
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
