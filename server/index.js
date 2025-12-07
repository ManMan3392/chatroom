const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const os = require("os");
const PORT = process.env.PORT || 3000;

// Optional MySQL persistence
const mysql = require("mysql2/promise");
const MYSQL_HOST =
  process.env.MYSQL_HOST ||
  process.env.DATABASE_HOST ||
  "rm-2zeah3p38pm2zu3n06o.mysql.rds.aliyuncs.com";
const MYSQL_PORT = process.env.MYSQL_PORT || 3306;
const MYSQL_USER =
  process.env.MYSQL_USER || process.env.DATABASE_USER || "root";
const MYSQL_PASSWORD =
  process.env.MYSQL_PASSWORD || process.env.DATABASE_PASSWORD || "uehu62u8AA";
const MYSQL_DB =
  process.env.MYSQL_DB || process.env.DATABASE_NAME || "chatroom";
let dbPool = null;

const app = express();
const server = http.createServer(app);

// When behind a proxy (Render, Heroku, etc.), trust X-Forwarded-* headers
app.set("trust proxy", true);

const wss = new WebSocket.Server({ noServer: true });

// Load messages
const MESSAGES_FILE = path.join(__dirname, "messages.json");
let messageHistory = [];

try {
  if (fs.existsSync(MESSAGES_FILE)) {
    const data = fs.readFileSync(MESSAGES_FILE, "utf8");
    messageHistory = JSON.parse(data);
    // Keep only real chat messages in the in-memory history to avoid
    // serving login/logout system events as empty chat bubbles later.
    messageHistory = messageHistory.filter((m) => {
      const t = m.type || m.msgType || m.msg_type || "message";
      return t === "message";
    });
  }
} catch (err) {
  console.error("Failed to load messages:", err);
}

function saveMessages() {
  fs.writeFile(
    MESSAGES_FILE,
    JSON.stringify(messageHistory, null, 2),
    (err) => {
      if (err) console.error("Failed to save messages:", err);
    }
  );
}

async function initDb() {
  try {
    dbPool = mysql.createPool({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DB,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
    });

    // Ensure table exists
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        ts BIGINT NOT NULL,
        username VARCHAR(191),
        msg_type VARCHAR(32) NOT NULL,
        file_name VARCHAR(255),
        content TEXT NOT NULL,
        INDEX idx_ts (ts)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Load recent messages (most recent 200)
    const [rows] = await dbPool.execute(
      "SELECT id, ts, username, msg_type AS type, file_name AS fileName, content, msg_type FROM chat_messages ORDER BY ts DESC LIMIT 200"
    );
    // rows are newest first; reverse to oldest-first
    messageHistory = rows.reverse().map((r) => ({
      id: r.id,
      ts: r.ts,
      username: r.username,
      type: r.msg_type || r.type || "message",
      fileName: r.fileName,
      content: r.content,
      msgType: r.msg_type || "text",
    }));
    console.log("[Server] Loaded", messageHistory.length, "messages from DB");
  } catch (e) {
    console.warn(
      "[Server] initDb failed, falling back to file storage:",
      e.message || e
    );
    dbPool = null;
  }
}

function getLocalIPv4() {
  const ifaces = os.networkInterfaces();
  let candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        candidates.push(iface.address);
      }
    }
  }
  // Prefer 192.168.x.x
  const best = candidates.find((ip) => ip.startsWith("192.168."));
  if (best) return best;
  // Then 10.x.x.x (but try to avoid 10.0.2.x/10.0.3.x if possible, though hard to distinguish from valid LAN)
  const secondBest = candidates.find(
    (ip) =>
      ip.startsWith("10.") &&
      !ip.startsWith("10.0.2.") &&
      !ip.startsWith("10.0.3.")
  );
  if (secondBest) return secondBest;

  return candidates[0] || "127.0.0.1";
}

// Allow basic CORS for dev (front-end dev server runs on different port)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(express.static(path.join(__dirname, "../web-frontend-react/dist")));

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR);
    console.log("[Server] Created uploads directory at:", UPLOADS_DIR);
  } catch (err) {
    console.error("[Server] Failed to create uploads directory:", err);
  }
}

// serve uploaded files
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res, path, stat) => {
      res.set("Access-Control-Allow-Origin", "*");
    },
  })
);

// multer setup for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${unique}-${safeName}`);
  },
});
const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const uploadedUrl = `/uploads/${req.file.filename}`;
  // Build absolute URL using request host/proto so it works behind proxies (https on Render)
  const proto = (
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "http"
  ).split(",")[0];
  const hostHeader = req.get("host") || `${getLocalIPv4()}:${PORT}`;
  const absoluteUploadedUrl = `${proto}://${hostHeader}${uploadedUrl}`;

  const isVideo = req.file.mimetype && req.file.mimetype.startsWith("video");
  if (!isVideo) {
    return res.json({ url: absoluteUploadedUrl });
  }

  // attempt ffmpeg transcode; if ffmpeg not available or fails, return original URL
  const { spawn } = require("child_process");
  const inputPath = path.join(__dirname, "uploads", req.file.filename);
  const outName = req.file.filename.replace(/\.[^.]+$/, "") + "-transcoded.mp4";
  const outPath = path.join(__dirname, "uploads", outName);

  const ffmpegArgs = [
    "-y",
    "-i",
    inputPath,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    outPath,
  ];

  // choose ffmpeg command: prefer environment variable FFMPEG_PATH, fallback to 'ffmpeg'
  let ffmpegCmd = process.env.FFMPEG_PATH || "ffmpeg";
  // if FFMPEG_PATH is a directory, append executable name
  try {
    if (fs.existsSync(ffmpegCmd) && fs.lstatSync(ffmpegCmd).isDirectory()) {
      ffmpegCmd = path.join(
        ffmpegCmd,
        process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
      );
    }
  } catch (e) {
    // ignore
  }

  // if ffmpegCmd does not exist on disk and is not just 'ffmpeg', try to fallback
  let ffmpegAvailable = false;
  try {
    if (fs.existsSync(ffmpegCmd)) ffmpegAvailable = true;
  } catch (e) {}

  // If ffmpeg not available as a file, assume user may have 'ffmpeg' in PATH; check by trying spawn with no immediate response
  if (!ffmpegAvailable && ffmpegCmd !== "ffmpeg") {
    console.warn("[Server] ffmpeg binary not found at:", ffmpegCmd);
    // fallback to using 'ffmpeg' command (might be in PATH)
    ffmpegCmd = "ffmpeg";
  }

  console.log("[Server] ffmpeg command:", ffmpegCmd);

  // If ffmpeg is clearly not available (no file and not in PATH), skip transcode
  // We'll do a best-effort spawn check: attempt to spawn and handle ENOENT gracefully without double-responding
  let responded = false;
  let ff;
  try {
    ff = spawn(ffmpegCmd, ffmpegArgs, { windowsHide: true });
  } catch (spawnErr) {
    console.warn("ffmpeg spawn threw:", spawnErr);
    responded = true;
    return res.json({ url: absoluteUploadedUrl });
  }

  ff.on("error", (err) => {
    console.warn("ffmpeg spawn error:", err);
    if (!responded) {
      responded = true;
      return res.json({ url: absoluteUploadedUrl });
    }
  });

  ff.stderr.on("data", (d) => {
    // optional: log progress/debug
    // console.log(d.toString());
  });

  ff.on("close", (code) => {
    if (responded) return;
    responded = true;
    if (code === 0) {
      // success
      const finalUrl = `/uploads/${outName}`;
      // Use request host/proto to construct public URL (handles reverse proxy and HTTPS)
      const proto2 = (
        req.headers["x-forwarded-proto"] ||
        req.protocol ||
        "http"
      ).split(",")[0];
      const hostHeader2 = req.get("host") || `${getLocalIPv4()}:${PORT}`;
      const absoluteFinalUrl = `${proto2}://${hostHeader2}${finalUrl}`;
      return res.json({ url: absoluteFinalUrl });
    } else {
      console.warn("ffmpeg exited with code", code);
      return res.json({ url: absoluteUploadedUrl });
    }
  });
});

app.get("/api/messages", async (req, res) => {
  const beforeTs = parseInt(req.query.beforeTs) || Date.now();
  const limit = parseInt(req.query.limit) || 20;

  if (dbPool) {
    try {
      const [rows] = await dbPool.execute(
        "SELECT id, ts, username, msg_type AS type, file_name AS fileName, content FROM chat_messages WHERE ts < ? AND msg_type = 'message' ORDER BY ts DESC LIMIT ?",
        [beforeTs, limit]
      );
      const history = rows.reverse().map((r) => ({
        id: r.id,
        ts: r.ts,
        username: r.username,
        type: r.type || "message",
        fileName: r.fileName,
        content: r.content,
      }));
      return res.json(history);
    } catch (e) {
      console.error("[Server] /api/messages DB query failed:", e.message || e);
      // fallthrough to in-memory fallback
    }
  }

  // Fallback: in-memory/file cache (only real chat messages)
  const history = messageHistory
    .filter((m) => {
      const t = m.type || m.msgType || m.msg_type || "message";
      return t === "message" && m.ts < beforeTs;
    })
    .sort((a, b) => b.ts - a.ts) // Newest first
    .slice(0, limit)
    .reverse(); // Return oldest first for the chat log

  res.json(history);
});

// Admin: clear persisted messages and uploaded files
// Protected by ADMIN_TOKEN env var when set. If ADMIN_TOKEN is not set,
// requests from localhost are allowed for convenience (development only).
app.post("/api/admin/clear", async (req, res) => {
  try {
    const adminToken = process.env.ADMIN_TOKEN || "";
    const provided = (req.headers["x-admin-token"] || "") + "";

    const isLocal =
      req.ip === "::1" ||
      req.ip === "127.0.0.1" ||
      req.hostname === "localhost";
    if (adminToken) {
      if (!provided || provided !== adminToken) {
        return res.status(401).json({ error: "unauthorized" });
      }
    } else if (!isLocal) {
      // No token configured and request is not local => deny
      return res.status(403).json({ error: "admin token not configured" });
    }

    // Clear DB table if available
    let dbCleared = false;
    if (dbPool) {
      try {
        await dbPool.execute("DELETE FROM chat_messages");
        dbCleared = true;
        console.log("[Server] Cleared chat_messages table via admin API");
      } catch (e) {
        console.error(
          "[Server] Failed to clear DB via admin API:",
          e.message || e
        );
      }
    }

    // Clear messages.json
    try {
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2), "utf8");
      console.log("[Server] Cleared messages.json via admin API");
    } catch (e) {
      console.warn("[Server] Failed to clear messages.json via admin API:", e);
    }

    // Clear uploads directory (delete files, keep .gitkeep if present)
    const uploadsDir = path.join(__dirname, "uploads");
    let deletedFiles = 0;
    try {
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        for (const f of files) {
          if (f === ".gitkeep") continue;
          const fp = path.join(uploadsDir, f);
          try {
            const stat = fs.lstatSync(fp);
            if (stat.isFile() || stat.isSymbolicLink()) {
              fs.unlinkSync(fp);
              deletedFiles++;
            } else if (stat.isDirectory()) {
              // remove directory recursively
              fs.rmSync(fp, { recursive: true, force: true });
              deletedFiles++;
            }
          } catch (e) {
            console.warn(
              "[Server] Failed to remove upload file:",
              fp,
              e.message || e
            );
          }
        }
      }
      // clear in-memory cache as well
      messageHistory = [];
    } catch (e) {
      console.warn(
        "[Server] Failed to clear uploads via admin API:",
        e.message || e
      );
    }

    return res.json({ ok: true, dbCleared, deletedFiles });
  } catch (e) {
    console.error("[Server] /api/admin/clear error:", e.message || e);
    return res.status(500).json({ error: "internal_error" });
  }
});

server.on("upgrade", (request, socket, head) => {
  console.log(`[Server] 收到 Upgrade 请求: ${request.url}`);
  wss.handleUpgrade(request, socket, head, (ws) => {
    console.log("[Server] WebSocket 握手成功，触发 connection 事件");
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws, req) => {
  console.log(`[Server] 一个客户端已连接 IP: ${req.socket.remoteAddress}`);

  ws.on("message", async (message) => {
    console.log("收到消息: %s", message);

    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.error("Invalid JSON:", message);
      return;
    }

    // Ensure ID and timestamp for all saved messages
    if (!parsedMessage.id) {
      parsedMessage.id =
        Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    }
    if (!parsedMessage.ts) parsedMessage.ts = Date.now();

    // If DB is available, persist only real chat messages (type === 'message')
    if (dbPool && parsedMessage.type === "message") {
      try {
        const contentToStore =
          typeof parsedMessage.content === "string"
            ? parsedMessage.content
            : JSON.stringify(parsedMessage.content || "");
        await dbPool.execute(
          "INSERT INTO chat_messages (id, ts, username, msg_type, file_name, content) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)",
          [
            parsedMessage.id,
            parsedMessage.ts,
            parsedMessage.username || null,
            parsedMessage.type || "message",
            parsedMessage.fileName || null,
            contentToStore,
          ]
        );
      } catch (e) {
        console.error(
          "[Server] Failed to insert message into DB:",
          e.message || e
        );
      }
    }

    // Keep in-memory history and file backup only for real chat messages
    if (parsedMessage.type === "message") {
      messageHistory.push(parsedMessage);
      saveMessages();
    }

    // For login/logout include onlineCount
    if (parsedMessage.type === "login" || parsedMessage.type === "logout") {
      parsedMessage.onlineCount = wss.clients.size;
    }

    const broadcastData = JSON.stringify(parsedMessage);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(broadcastData);
      }
    });
  });

  ws.on("close", () => {
    console.log("一个客户端已断开连接");
  });
});

// Initialize DB (if configured) then start server
(async () => {
  await initDb();
  server.listen(PORT, "0.0.0.0", () => {
    const lanIp = getLocalIPv4();
    console.log(`服务器正在监听端口 ${PORT}`);
    console.log(`Local:   http://localhost:${PORT}`);
    console.log(`Network: http://${lanIp}:${PORT}`);
    console.log(
      `\n注意：为了在 Android 模拟器或手机上访问，请使用 Network 地址 (http://${lanIp}:5173) 访问前端页面。`
    );
  });
})();
