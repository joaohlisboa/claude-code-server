# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Claude Code Docker Server - an HTTP API wrapper for the Claude Code CLI in a Docker container. It provides a simple REST API interface to interact with Claude while maintaining authentication and workspace persistence.

## Core Architecture

The system consists of:
- **server.js**: Express.js HTTP server that spawns Claude CLI processes (server.js:1-323)
- **Docker container**: Runs Node.js 20 with Claude Code CLI installed globally
- **MCP integrations**: WhatsApp and Google Workspace MCP servers configured in .claude.json

## Key Commands

```bash
# Development workflow
docker compose up -d                          # Start the server in detached mode
docker compose logs -f claude-code-server     # Follow logs in real-time
docker compose down                           # Stop the server

# Authentication management
docker compose exec -it claude-code-server /bin/bash  # Interactive shell for auth
claude login                                  # (Inside container) Authenticate with Claude
docker volume rm claude-code-server_claude-auth       # Reset authentication completely

# Debugging and maintenance
docker compose exec claude-code-server claude --version  # Check Claude CLI version
docker compose restart claude-code-server     # Restart service only
```

## API Endpoints

- **POST /claude**: Execute Claude with a prompt
  - Body: `{ "prompt": string, "args": string[], "cwd": string }`
  - Automatically prepends current date to prompts (server.js:155-157)
  - Returns JSON response from Claude CLI
  - Example: `curl -X POST http://localhost:8888/claude -H 'Content-Type: application/json' -d '{"prompt":"hello world"}'`

- **GET /healthz**: Health check endpoint
  - Returns: `{"ok": true}`

## Important Implementation Details

### Logging System
The server implements comprehensive human-readable logging with:
- Section separators for request tracking (server.js:10-23)
- Verbose mode support via VERBOSE environment variable (server.js:8)
- Real-time output formatting for Claude's thinking process (server.js:24-105)

### Date Handling
The server automatically prepends "Today's date is YYYY-MM-DD" to all prompts (server.js:155-157) to ensure Claude has current date context.

### MCP Configuration
MCP servers are configured in .claude.json (mounted via Docker):
- **google-workspace**: HTTP server at host.docker.internal:8000/mcp
- **whatsapp**: Local Python server using uv
  - Command: `uv --directory /whatsapp-mcp/whatsapp-mcp-server run main.py`
  - Environment: WhatsApp bridge at host.docker.internal:8080
  - Database: `/whatsapp-mcp/whatsapp-bridge/store/messages.db`

### Docker Volumes
- `claude-auth`: Persistent authentication storage at /root/.claude
- Mount points for workspace, CLAUDE.md, and MCP configs (docker-compose.yml:10-17)

## Development Notes

### Architecture Details
- The server uses `dumb-init` for proper signal handling in containers (Dockerfile:19)
- Express JSON limit is set to 10mb for large prompts (server.js:6)
- Process spawning uses ignore/pipe/pipe stdio configuration (server.js:178)
- Error handling includes uncaught exceptions and unhandled rejections (server.js:310-323)
- Uses ES modules (`"type": "module"` in package.json)

### Environment Variables
- `VERBOSE=true`: Enable verbose mode to see Claude's thinking process and detailed formatting
- `PORT=8888`: Server port (default, set in Dockerfile)

### Dependencies
- **express@4.19.2**: HTTP server framework
- **@anthropic-ai/claude-code**: Claude CLI (installed globally in container)
- **uv**: Python package manager for WhatsApp MCP server

### File Structure
- `server.js`: Main HTTP server with request handling and Claude CLI spawning
- `verboseFormatter.js`: Output formatting for human-readable Claude responses
- `docker-compose.yml`: Container orchestration with volume mounts
- `.claude.json`: MCP server configuration and Claude CLI settings