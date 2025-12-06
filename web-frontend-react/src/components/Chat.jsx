import React, { useState, useEffect, useRef } from "react";
import MessageList from "./MessageList";
import InputArea from "./InputArea";

function Chat({
  messages,
  username,
  onSendMessage,
  onlineCount,
  onLoadMore,
  onLogout,
}) {
  const messageListRef = useRef(null);
  const lastMessageCountRef = useRef(0);

  const scrollToBottom = () => {
    if (messageListRef.current) {
      setTimeout(() => {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      }, 0);
    }
  };

  useEffect(() => {
    // 只在收到新消息时滚动到底部
    // 检查是否有新消息添加到末尾
    if (messages.length > lastMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      // 如果最新消息是自己发送的或系统消息，滚动到底部
      if (
        lastMsg.type === "system" ||
        (lastMsg.type === "message" && lastMsg.isOwn)
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
        <div className="chat-title">Chat ({onlineCount})</div>
        <div className="more-icon">•••</div>
      </header>

      <MessageList
        ref={messageListRef}
        messages={messages}
        username={username}
        onLoadMore={onLoadMore}
      />

      <InputArea onSendMessage={onSendMessage} />
    </div>
  );
}

export default Chat;
