import React, { useState, useEffect, useRef } from "react";
import Login from "./components/Login";
import Chat from "./components/Chat";

function App() {
  const [username, setUsername] = useState(
    localStorage.getItem("chat_username") || ""
  );
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);

  const loadHistoryMessages = async (beforeTs = null) => {
    try {
      const url = beforeTs
        ? `/api/messages?beforeTs=${beforeTs}&limit=20`
        : `/api/messages?limit=20`;

      let apiUrl = url;
      // If in dev mode (port 5173), point to server port 3000
      if (window.location.port === "5173") {
        apiUrl = `http://${window.location.hostname}:3000${url}`;
      }

      const res = await fetch(apiUrl);
      const data = await res.json();

      if (data.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = data
            .filter((m) => !existingIds.has(m.id))
            .map((m) => ({
              ...m,
              type: "message", // Ensure type is set
              isOwn: m.username === username,
            }));
          return [...newMessages, ...prev];
        });
        return data.length; // Return count
      }
      return 0;
    } catch (e) {
      console.error("Failed to load history:", e);
      return 0;
    }
  };

  useEffect(() => {
    let socket = null;

    if (username) {
      // Load initial history
      loadHistoryMessages();

      // Dynamically determine WebSocket URL based on current page location
      // This ensures it works on localhost, LAN IP, and Emulator (if accessing via IP)
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.hostname;

      // In development (Vite default port 5173), backend is on 3000.
      // In production (served by backend), use the same port as the page.
      let wsPort = window.location.port ? `:${window.location.port}` : "";
      if (window.location.port === "5173") {
        wsPort = ":3000";
      }

      socket = new WebSocket(`${wsProtocol}//${wsHost}${wsPort}`);

      socket.onopen = () => {
        console.log("Connected to WebSocket");
        socket.send(
          JSON.stringify({
            type: "login",
            username: username,
          })
        );
        setIsLoggedIn(true);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
      };

      socket.onclose = () => {
        console.log("Disconnected");
        setIsLoggedIn(false);
      };

      socket.onerror = (error) => {
        console.error("WebSocket Error:", error);
      };

      setWs(socket);
    }

    return () => {
      if (socket) {
        console.log("Closing WebSocket connection");
        socket.close();
      }
    };
  }, [username]);

  // Removed connectWebSocket function as it's now inside useEffect

  const handleMessage = (data) => {
    switch (data.type) {
      case "login":
        setMessages((prev) => [
          ...prev,
          { type: "system", content: `${data.username} joined the chat` },
        ]);
        setOnlineCount(data.onlineCount);
        break;
      case "logout":
        setMessages((prev) => [
          ...prev,
          { type: "system", content: `${data.username} left the chat` },
        ]);
        setOnlineCount(data.onlineCount);
        break;
      case "message":
        setMessages((prev) => [
          ...prev,
          {
            id: data.id,
            ts: data.ts,
            type: "message",
            username: data.username,
            content: data.content,
            msgType: data.msgType, // 'text', 'image', 'audio', 'file'
            fileName: data.fileName, // For files
            isOwn: data.username === username,
          },
        ]);
        // Show notification on Android
        if (data.username !== username) {
          // Android native callback
          if (window.Android) {
            window.Android.showNotification(
              "New Message",
              `${data.username}: ${
                data.msgType === "text"
                  ? data.content
                  : "[" + data.msgType + "]"
              }`
            );
          }

          // Browser Notification API
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
    // Request permission for browser notifications
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
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "message",
          username: username,
          content: content,
          msgType: type,
          fileName: fileName,
        })
      );
      // Optimistic update? The server broadcasts back, so maybe wait.
      // But usually we want to see our own message immediately.
      // The current server implementation broadcasts to everyone including sender?
      // Let's check server/index.js if possible, but assuming standard behavior.
      // Actually, the `handleMessage` handles incoming, so if server broadcasts to all, we are good.
    }
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
        />
      )}
    </div>
  );
}

export default App;
