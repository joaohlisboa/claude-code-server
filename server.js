import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { formatVerboseOutput } from "./verboseFormatter.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

const USE_VERBOSE = process.env.VERBOSE === 'true' || process.env.VERBOSE === '1';

function logSection(title) {
  const line = "=".repeat(80);
  console.log(`\n${line}`);
  console.log(`${title}`);
  console.log(line);
}

function logSubSection(title) {
  const line = "-".repeat(60);
  console.log(`\n${line}`);
  console.log(`${title}`);
  console.log(line);
}

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  req.startTime = Date.now();
  
  if (req.path !== '/healthz') {
    logSection(`📥 INCOMING REQUEST [${requestId}]`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Method: ${req.method}`);
    console.log(`Path: ${req.path}`);
    console.log(`IP: ${req.ip || req.connection.remoteAddress}`);
  }
  
  next();
});

// Quick health check
app.get("/healthz", (req, res) => res.json({ ok: true }));

/**
 * POST /claude
 * body: { prompt: string, args?: string[], cwd?: string }
 * Runs: claude -p "<prompt>" --output-format json ...args
 */
app.post("/claude", (req, res) => {
  const { prompt, args = [], cwd } = req.body || {};
  const { requestId, startTime } = req;
  
  logSubSection("📝 PROMPT RECEIVED");
  console.log(prompt || "(no prompt provided)");
  
  if (args && args.length > 0) {
    logSubSection("⚙️ ADDITIONAL ARGUMENTS");
    console.log(args.join(" "));
  }
  
  if (cwd) {
    logSubSection("📁 WORKING DIRECTORY");
    console.log(cwd);
  }
  
  if (typeof prompt !== "string" || !prompt.trim()) {
    logSection(`❌ ERROR: Missing prompt [${requestId}]`);
    console.log("Request rejected: prompt is required");
    return res.status(400).json({ error: "prompt is required" });
  }

  // Prepend current date to the prompt
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }); // e.g., "Monday, August 11, 2025"
  const promptWithDate = `${today}: ${prompt}`;

  // Build argv - add --model sonnet and --verbose if requested
  const argv = ["-p", promptWithDate, "--output-format", "json", "--model", "sonnet"];
  if (USE_VERBOSE) {
    argv.push("--verbose");
  }
  argv.push(...args);
  
  logSubSection("🚀 EXECUTING CLAUDE");
  console.log(`Command: claude ${argv.map(arg => {
    // Quote args that contain spaces for display
    if (arg.includes(' ') && !arg.startsWith('"')) {
      return `"${arg}"`;
    }
    return arg;
  }).join(' ')}`);
  console.log(`Verbose mode: ${USE_VERBOSE ? 'ON' : 'OFF'}`);

  const processStartTime = Date.now();
  const child = spawn("claude", argv, {
    cwd: cwd && typeof cwd === "string" ? cwd : process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (d) => {
    stdout += d.toString();
  });
  
  child.stderr.on("data", (d) => {
    const msg = d.toString();
    stderr += msg;
    
    // Show stderr in real-time if it's not empty
    if (msg.trim()) {
      logSubSection("⚠️ CLAUDE STDERR OUTPUT");
      process.stderr.write(msg);
    }
  });

  child.on("close", (code) => {
    const processDuration = Date.now() - processStartTime;
    const totalDuration = Date.now() - startTime;
    
    if (code === 0) {
      logSubSection("✅ CLAUDE COMPLETED SUCCESSFULLY");
      console.log(`Process duration: ${processDuration}ms`);
      console.log(`Total request duration: ${totalDuration}ms`);
      
      let responseToSend;
      let responseData;
      
      // Try to parse JSON response (works for both verbose and non-verbose)
      try {
        const jsonData = JSON.parse(stdout);
        
        if (USE_VERBOSE && Array.isArray(jsonData)) {
          // Verbose mode: parse the event array
          logSubSection("💭 CLAUDE PROCESSING");
          
          for (const event of jsonData) {
            const formatted = formatVerboseOutput(JSON.stringify(event));
            if (formatted) {
              console.log(formatted);
            }
            
            // Capture the final result event
            if (event.type === 'result' && !event.is_error) {
              responseData = event;
            }
          }
          
          // Send the final result to client
          responseToSend = responseData ? JSON.stringify(responseData) : stdout;
        } else {
          // Non-verbose mode or single object response
          responseData = jsonData;
          responseToSend = stdout;
        }
        
        // Log metadata if available
        if (responseData && (responseData.total_cost_usd || responseData.duration_ms || responseData.num_turns)) {
          logSubSection("📊 RESPONSE METADATA");
          if (responseData.total_cost_usd) console.log(`Cost: $${responseData.total_cost_usd}`);
          if (responseData.duration_ms) console.log(`Claude duration: ${responseData.duration_ms}ms`);
          if (responseData.num_turns) console.log(`Turns: ${responseData.num_turns}`);
          if (responseData.session_id) console.log(`Session ID: ${responseData.session_id}`);
        }
        
        // Log the response content
        logSubSection("📤 RESPONSE SENT TO CLIENT");
        if (responseData) {
          if (responseData.result) {
            console.log(responseData.result);
          } else if (responseData.content) {
            console.log(responseData.content);
          } else {
            console.log(JSON.stringify(responseData, null, 2));
          }
        } else {
          console.log(stdout);
        }
      } catch (parseError) {
        // Failed to parse as JSON - send raw output
        responseToSend = stdout;
        logSubSection("📤 RESPONSE SENT TO CLIENT");
        console.log(stdout);
      }
      
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(200).send(responseToSend);
    } else {
      logSection(`❌ CLAUDE FAILED [${requestId}]`);
      console.log(`Exit code: ${code}`);
      console.log(`Process duration: ${processDuration}ms`);
      
      if (stderr) {
        logSubSection("ERROR OUTPUT");
        console.log(stderr);
      }
      
      res.status(500).json({ error: "claude failed", code, stderr });
    }
    
    logSection(`🏁 REQUEST COMPLETE [${requestId}]`);
  });
  
  child.on("error", (error) => {
    logSection(`❌ FAILED TO SPAWN CLAUDE [${requestId}]`);
    console.log(`Error: ${error.message}`);
    if (error.stack) {
      console.log(`Stack: ${error.stack}`);
    }
    // Send error response to client
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to execute Claude CLI", message: error.message });
    }
  });
});

const port = Number(process.env.PORT || 8888);
app.listen(port, () => {
  logSection("🚀 CLAUDE CODE SERVER STARTED");
  console.log(`Port: ${port}`);
  console.log(`Verbose mode: ${USE_VERBOSE ? 'ENABLED' : 'DISABLED'} (set VERBOSE=true to enable)`);
  console.log(`Node version: ${process.version}`);
  console.log(`PID: ${process.pid}`);
  console.log("\nExample request:");
  console.log(`curl -X POST http://localhost:${port}/claude -H 'Content-Type: application/json' -d '{"prompt":"hello"}'`);
});

process.on('uncaughtException', (error) => {
  logSection("💥 UNCAUGHT EXCEPTION");
  console.log(`Error: ${error.message}`);
  if (error.stack) {
    console.log(`Stack: ${error.stack}`);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logSection("💥 UNHANDLED REJECTION");
  console.log(`Reason: ${reason}`);
  console.log(`Promise: ${promise}`);
});