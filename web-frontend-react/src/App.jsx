import React, { useState, useEffect, useRef } from "react";
import Login from "./components/Login";
import Chat from "./components/Chat";
import { get, getWebSocketUrl } from "./services/api";

function App() {
  const [username, setUsername] = useState(
    localStorage.getItem("chat_username") || ""
  );
  // isLoggedIn 现在基于 username 的存在来确定
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const isLoggedIn = !!username;

  const loadHistoryMessages = async (beforeTs = null) => {
    try {
      const url = beforeTs
        ? `/api/messages?beforeTs=${beforeTs}&limit=20`
        : `/api/messages?limit=20`;

      const data = await get(url);

      if (data.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = data
            .filter((m) => !existingIds.has(m.id))
            .map((m) => ({
              ...m,
              // Preserve original type from server/DB (could be 'message' or others)
              type: m.type || m.msgType || "message",
              isOwn: m.username === username,
            }));
          return [...prev, ...newMessages].sort((a, b) => a.ts - b.ts);
        });
        return data.length;
      }
      return 0;
    } catch (e) {
      console.error("Failed to load history:", e);
      return 0;
    }
  };

  useEffect(() => {
    const maxReconnectAttempts = 5;

    const connectWebSocket = () => {
      if (!username) return;

      // 如果已有连接或正在连接，则不重复创建
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
          return;
        }
      }

      const wsUrl = getWebSocketUrl();

      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          console.log("WebSocket connected");
          socket.send(
            JSON.stringify({
              type: "login",
              username: username,
            })
          );
          setWsConnected(true);
          reconnectAttemptsRef.current = 0; // 重置重连次数
        };

        socket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          handleMessage(data);
        };

        socket.onclose = () => {
          console.log("WebSocket closed");
          setWsConnected(false);
          if (wsRef.current === socket) {
            wsRef.current = null;
          }

          // 自动重连（最多5次）
          if (reconnectAttemptsRef.current < maxReconnectAttempts && username) {
            reconnectAttemptsRef.current++;
            const attempt = reconnectAttemptsRef.current;
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.log(
              `Attempting to reconnect in ${delay}ms (attempt ${attempt}/${maxReconnectAttempts})`
            );
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
          }
        };

        socket.onerror = (error) => {
          console.error("WebSocket Error:", error);
          setWsConnected(false);
        };

        setWs(socket);
      } catch (err) {
        console.error("Failed to create WebSocket:", err);
        setWsConnected(false);
      }
    };

    // 初始化 WebSocket 和加载历史消息
    if (username) {
      loadHistoryMessages();
      connectWebSocket();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [username]);

  const handleMessage = (data) => {
    switch (data.type) {
      case "login":
        setMessages((prev) => {
          const content = `${data.username}进入了聊天室`;
          // 去重：避免重复的系统消息
          if (prev.some((m) => m.type === "system" && m.content === content)) {
            return prev;
          }
          return [
            ...prev,
            {
              type: "system",
              content,
              ts: Date.now(),
            },
          ];
        });
        setOnlineCount(data.onlineCount);
        break;
      case "logout":
        setMessages((prev) => {
          const content = `${data.username}离开了聊天室`;
          if (prev.some((m) => m.type === "system" && m.content === content)) {
            return prev;
          }
          return [
            ...prev,
            {
              type: "system",
              content,
              ts: Date.now(),
            },
          ];
        });
        setOnlineCount(data.onlineCount);
        break;
      case "message":
        // 过滤空消息（content 为空且没有文件名）以及重复 id
        if (
          (data.content === undefined ||
            data.content === null ||
            data.content === "") &&
          !data.fileName
        ) {
          return;
        }
        setMessages((prev) => {
          if (data.id && prev.some((m) => m.id === data.id)) return prev;
          return [
            ...prev,
            {
              id: data.id,
              ts: data.ts,
              type: "message",
              username: data.username,
              content: data.content,
              msgType: data.msgType,
              fileName: data.fileName,
              isOwn: data.username === username,
            },
          ];
        });
        if (data.username !== username) {
          if (window.Android) {
            window.Android.showNotification(
              `${data.username}: ${
                data.msgType === "text"
                  ? data.content
                  : "[" + data.msgType + "]"
              }`
            );
          }

          try {
            const body =
              data.msgType === "text" ? data.content : `[${data.msgType}]`;
            if (window.Notification && Notification.permission === "granted") {
              new Notification(data.username, { body: body });
            }
          } catch (e) {
            console.warn("Notification error", e);
          }
        }
        break;
      case "transcoded":
        setMessages((prev) =>
          prev.map((msg) =>
            msg.content && msg.content === data.original
              ? { ...msg, content: data.url }
              : msg
          )
        );
        break;
      default:
        break;
    }
  };

  const handleLogin = (user) => {
    setUsername(user);
    localStorage.setItem("chat_username", user);
    if (window.Notification && Notification.permission !== "granted") {
      try {
        Notification.requestPermission().then((perm) => {
          console.log("Notification permission:", perm);
        });
      } catch (e) {
        console.warn("Notification permission request failed", e);
      }
    }
  };

  const sendMessage = (content, type = "text", fileName = null) => {
    const socket = wsRef.current || ws;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "message",
          username: username,
          content: content,
          msgType: type,
          fileName: fileName,
        })
      );
    }
  };

  const handleLogout = () => {
    // 发送 logout 消息到服务器
    const socket = wsRef.current || ws;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "logout",
          username: username,
        })
      );
    }
    // 关闭 WebSocket 连接
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    // 清除用户数据
    setUsername("");
    setMessages([]);
    setOnlineCount(0);
    setWsConnected(false);
    localStorage.removeItem("chat_username");
  };

  return (
    <div className="app-container" style={{ width: "100%", height: "100%" }}>
      {!isLoggedIn ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Chat
          messages={messages}
          username={username}
          onSendMessage={sendMessage}
          onlineCount={onlineCount}
          onLoadMore={loadHistoryMessages}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default App;
