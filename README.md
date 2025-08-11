# Claude Code Docker Server

HTTP API wrapper for Claude Code CLI in a Docker container.

## Features

- 🐳 Fully containerized Claude Code CLI
- 🔐 OAuth (subscription) authentication via Claude CLI
- 💾 Authentication persists permanently using Docker volumes
- 📁 Optional workspace mounting for code access
- 🛡️ Simple HTTP API interface

## Quick Start

```bash
docker compose up -d
```

First-time auth (follow OAuth URL in logs):
```bash
# Access the container shell interactively
docker compose exec -it claude-code-server /bin/bash

# Inside the container, run:
claude login

# Follow the authentication prompts (it will provide a URL to authenticate in your browser)
# Exit the container when done
exit
```

Test request:
```bash
curl -X POST http://localhost:8081/run \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"hello world"}'
```

## API

**POST /run**
```json
{"prompt": "Your prompt", "args": ["--optional"], "cwd": "/workspace"}
```

**GET /healthz** - Health check

## Configuration

Mount workspace in `docker-compose.yml`:
```yaml
volumes:
  - ./your-project:/workspace
```

Reset auth: `docker volume rm claude-code-server_claude-auth`