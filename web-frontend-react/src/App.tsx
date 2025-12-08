import React from "react";
import { useChat } from "./hooks/useChat";
import Login from "./components/login";
import Chat from "./components/chat";

const App: React.FC = () => {
  const {
    username,
    messages,
    onlineCount,
    loadHistoryMessages,
    sendMessage,
    handleLogin,
    handleLogout,
  } = useChat();

  const isLoggedIn = !!username;

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
};

export default App;
