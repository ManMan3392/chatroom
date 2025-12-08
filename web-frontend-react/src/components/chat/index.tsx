import React, { useEffect, useRef } from "react";
import { MessageList } from "../MessageList";
import Inputs from "../input";
import { adminClear } from "../../services/api";
import "./style.css";

type Message = {
  type?: string;
  isOwn?: boolean;
  [key: string]: unknown;
};

interface ChatProps {
  messages: Message[];
  username?: string | null;
  onSendMessage?: (
    content: string | null,
    type: "text" | "image" | "video" | "audio" | "file",
    filename?: string | null
  ) => void;
  onlineCount?: number;
  onLoadMore?: (beforeTs: number | string) => number | Promise<number>;
  onLogout?: () => void;
}

const Chat: React.FC<ChatProps> = ({
  messages,
  username,
  onSendMessage,
  onlineCount = 0,
  onLoadMore,
  onLogout,
}) => {
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const lastMessageCountRef = useRef<number>(0);

  const scrollToBottom = () => {
    if (messageListRef.current) {
      setTimeout(() => {
        if (!messageListRef.current) return;
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      }, 0);
    }
  };

  useEffect(() => {
    if (messages.length > lastMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (
        lastMsg &&
        (lastMsg.type === "system" ||
          (lastMsg.type === "message" && lastMsg.isOwn))
      ) {
        scrollToBottom();
      }
      lastMessageCountRef.current = messages.length;
    }
  }, [messages]);

  return (
    <div id="chat-container">
      <header id="chat-header">
        <div className="back-icon" onClick={onLogout}>
          ‹
        </div>
        <div className="chat-title">聊天室 ({onlineCount})</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="header-btn"
            onClick={async () => {
              if (
                !confirm(
                  "确认要清空所有聊天记录和 uploads 缓存？此操作不可恢复。"
                )
              )
                return;
              const token = window.prompt(
                "输入admin",
                ""
              );
              try {
                const res = await adminClear(token || undefined);
                console.log("adminClear result:", res);
                window.location.reload();
              } catch (e) {
                console.error(e);
                alert("清理失败：" + (e));
              }
            }}
          >
            清空数据
          </button>
          <div className="more-icon">•••</div>
        </div>
      </header>

      <MessageList
        ref={messageListRef}
        messages={messages}
        username={username}
        onLoadMore={onLoadMore}
      />

      <Inputs onSendMessage={onSendMessage} />
    </div>
  );
};

export default Chat;
