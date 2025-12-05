import React, { useState, useEffect, useRef } from "react";
import MessageList from "./MessageList";
import InputArea from "./InputArea";

function Chat({ messages, username, onSendMessage, onlineCount, onLoadMore }) {
  const messagesEndRef = useRef(null);
  const lastMessageIdRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      // Only scroll if the last message has changed (new message sent/received)
      // or if it's the initial load (lastMessageIdRef.current is null)
      if (lastMsg.id !== lastMessageIdRef.current) {
        scrollToBottom();
        lastMessageIdRef.current = lastMsg.id;
      }
    }
  }, [messages]);

  return (
    <div id="chat-container">
      <header id="chat-header">
        <div className="back-icon">‹</div>
        <div className="chat-title">Chat ({onlineCount})</div>
        <div className="more-icon">•••</div>
      </header>

      <MessageList
        messages={messages}
        username={username}
        onLoadMore={onLoadMore}
      />
      <div ref={messagesEndRef} />

      <InputArea onSendMessage={onSendMessage} />
    </div>
  );
}

export default Chat;
