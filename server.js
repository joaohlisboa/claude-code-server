import express from "express";
import { spawn } from "node:child_process";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Quick health check
app.get("/healthz", (req, res) => res.json({ ok: true }));

/**
 * POST /claude
 * body: { prompt: string, args?: string[], cwd?: string }
 * Runs: claude -p "<prompt>" --output-format json ...args
 */
app.post("/claude", (req, res) => {
  const { prompt, args = [], cwd } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }

  // Build argv without using a shell (avoids quoting issues)
  const argv = ["-p", prompt, "--output-format", "json", ...args];

  const child = spawn("claude", argv, {
    cwd: cwd && typeof cwd === "string" ? cwd : process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (d) => { stdout += d.toString(); });
  child.stderr.on("data", (d) => {
    const msg = d.toString();
    stderr += msg;
    // Surface useful info (like the OAuth login URL) in container logs
    process.stderr.write(msg);
  });

  child.on("close", (code) => {
    if (code === 0) {
      // Claude CLI in JSON mode emits a JSON object
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(200).send(stdout);
    } else {
      // If not logged in yet, the CLI prints an OAuth URL here.
      res.status(500).json({ error: "claude failed", code, stderr });
    }
  });
});

const port = Number(process.env.PORT || 8888);
app.listen(port, () => {
  console.log(`[server] listening on :${port}`);
  console.log(`[server] try: curl -X POST http://localhost:${port}/claude -H 'Content-Type: application/json' -d '{"prompt":"hello"}'`);
});
