import { useEffect, useRef, useState } from "react";
import { get, getWebSocketUrl } from "../services/api";

export type Message = {
  id?: string | number;
  ts?: number;
  type?: string;
  username?: string;
  content?: string | null;
  msgType?: string;
  fileName?: string | null;
  isOwn?: boolean;
  [k: string]: any;
};

export function useChat(initialUsername = "") {
  const [username, setUsername] = useState<string>(
    localStorage.getItem("chat_username") || initialUsername
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  const loadHistoryMessages = async (
    beforeTs: number | string | null = null
  ) => {
    try {
      const url = beforeTs
        ? `/api/messages?beforeTs=${beforeTs}&limit=20`
        : `/api/messages?limit=20`;
      const data = await get(url);
      if (Array.isArray(data) && data.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = data
            .filter((m: any) => !existingIds.has(m.id))
            .map((m: any) => ({
              ...m,
              type: m.type || m.msgType || "message",
              isOwn: m.username === username,
            }));
          return [...prev, ...newMessages].sort(
            (a, b) => (a.ts || 0) - (b.ts || 0)
          );
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

      if (wsRef.current) {
        const state = wsRef.current.readyState;
        if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
      }

      const wsUrl = getWebSocketUrl();
      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          socket.send(JSON.stringify({ type: "login", username }));
          setWsConnected(true);
          reconnectAttemptsRef.current = 0;
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case "login": {
                setMessages((prev) => {
                  const content = `${data.username}进入了聊天室`;
                  if (
                    prev.some(
                      (m) => m.type === "system" && m.content === content
                    )
                  )
                    return prev;
                  return [...prev, { type: "system", content, ts: Date.now() }];
                });
                setOnlineCount(data.onlineCount);
                break;
              }
              case "logout": {
                setMessages((prev) => {
                  const content = `${data.username}离开了聊天室`;
                  if (
                    prev.some(
                      (m) => m.type === "system" && m.content === content
                    )
                  )
                    return prev;
                  return [...prev, { type: "system", content, ts: Date.now() }];
                });
                setOnlineCount(data.onlineCount);
                break;
              }
              case "message": {
                if (
                  (data.content === undefined ||
                    data.content === null ||
                    data.content === "") &&
                  !data.fileName
                )
                  return;
                setMessages((prev) => {
                  if (data.id && prev.some((m) => m.id === data.id))
                    return prev;
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
                  try {
                    const body =
                      data.msgType === "text"
                        ? data.content
                        : `[${data.msgType}]`;
                    if (
                      window.Notification &&
                      Notification.permission === "granted"
                    ) {
                      // eslint-disable-next-line no-new
                      new Notification(data.username, { body });
                    }
                  } catch (e) {
                    console.warn("Notification error", e);
                  }
                }
                break;
              }
              case "transcoded": {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.content && msg.content === data.original
                      ? { ...msg, content: data.url }
                      : msg
                  )
                );
                break;
              }
              default:
                break;
            }
          } catch (e) {
            console.warn("Invalid WS message", e);
          }
        };

        socket.onclose = () => {
          setWsConnected(false);
          if (wsRef.current === socket) wsRef.current = null;
          if (reconnectAttemptsRef.current < maxReconnectAttempts && username) {
            reconnectAttemptsRef.current++;
            const attempt = reconnectAttemptsRef.current;
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            reconnectTimeoutRef.current = window.setTimeout(
              connectWebSocket,
              delay
            );
          }
        };

        socket.onerror = (error) => {
          console.error("WebSocket Error:", error);
          setWsConnected(false);
        };
      } catch (err) {
        console.error("Failed to create WebSocket:", err);
        setWsConnected(false);
      }
    };

    if (username) {
      loadHistoryMessages();
      connectWebSocket();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const sendMessage = (
    content: string | null,
    type = "text",
    fileName: string | null = null
  ) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "message",
          username,
          content,
          msgType: type,
          fileName,
        })
      );
    }
  };

  const handleLogin = (user: string) => {
    setUsername(user);
    localStorage.setItem("chat_username", user);
    try {
      if (window.Notification && Notification.permission !== "granted") {
        Notification.requestPermission().then(() => {});
      }
    } catch (e) {
      console.warn("Notification permission request failed", e);
    }
  };

  const handleLogout = () => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "logout", username }));
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setUsername("");
    setMessages([]);
    setOnlineCount(0);
    setWsConnected(false);
    localStorage.removeItem("chat_username");
  };

  return {
    username,
    setUsername,
    messages,
    onlineCount,
    wsConnected,
    loadHistoryMessages,
    sendMessage,
    handleLogin,
    handleLogout,
  } as const;
}
