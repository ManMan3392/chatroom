import React, { useState } from "react";
import "./style.css";

interface LoginProps {
  onLogin: (username: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [inputUsername, setInputUsername] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUsername.trim()) {
      onLogin(inputUsername.trim());
    }
  };

  return (
    <div id="login-container">
      <div className="login-content">
        <div className="login-header">
          <h1 className="login-title">登录</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username-input">姓名</label>
            <input
              type="text"
              id="username-input"
              placeholder="请输入您的姓名"
              value={inputUsername}
              onChange={(e) => setInputUsername(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" id="login-button">
            Log In
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
