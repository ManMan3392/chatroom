const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const os = require("os");
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ noServer: true });

// Load messages
const MESSAGES_FILE = path.join(__dirname, "messages.json");
let messageHistory = [];

try {
  if (fs.existsSync(MESSAGES_FILE)) {
    const data = fs.readFileSync(MESSAGES_FILE, "utf8");
    messageHistory = JSON.parse(data);
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

  const hostForClient = `${getLocalIPv4()}:${PORT}`;
  const absoluteUploadedUrl = `http://${hostForClient}${uploadedUrl}`;

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
      // Always use LAN IP
      const hostForClient = `${getLocalIPv4()}:${PORT}`;
      const absoluteFinalUrl = `http://${hostForClient}${finalUrl}`;
      return res.json({ url: absoluteFinalUrl });
    } else {
      console.warn("ffmpeg exited with code", code);
      return res.json({ url: absoluteUploadedUrl });
    }
  });
});

app.get("/api/messages", (req, res) => {
  const beforeTs = parseInt(req.query.beforeTs) || Date.now();
  const limit = parseInt(req.query.limit) || 20;

  // Filter messages before the timestamp and sort by timestamp desc
  const history = messageHistory
    .filter((m) => m.ts < beforeTs)
    .sort((a, b) => b.ts - a.ts) // Newest first
    .slice(0, limit)
    .reverse(); // Return oldest first for the chat log

  res.json(history);
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

  ws.on("message", (message) => {
    console.log("收到消息: %s", message);

    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.error("Invalid JSON:", message);
      return;
    }

    if (parsedMessage.type === "message") {
      // Add ID and timestamp
      parsedMessage.id =
        Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
      parsedMessage.ts = Date.now();

      // Save to history
      messageHistory.push(parsedMessage);
      saveMessages();

      // Broadcast the updated message with id and ts
      const broadcastData = JSON.stringify(parsedMessage);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcastData);
        }
      });
    } else {
      // Broadcast original message for other types (login, etc.)
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message.toString());
        }
      });
    }
  });

  ws.on("close", () => {
    console.log("一个客户端已断开连接");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const lanIp = getLocalIPv4();
  console.log(`服务器正在监听端口 ${PORT}`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${lanIp}:${PORT}`);
  console.log(
    `\n注意：为了在 Android 模拟器或手机上访问，请使用 Network 地址 (http://${lanIp}:5173) 访问前端页面。`
  );
});
