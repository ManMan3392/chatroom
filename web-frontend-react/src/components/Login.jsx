import React, { useState } from 'react';

function Login({ onLogin }) {
  const [inputUsername, setInputUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputUsername.trim()) {
      onLogin(inputUsername.trim());
    }
  };

  return (
    <div id="login-container">
      <div className="login-content">
        <div className="login-header">
          <h1 className="login-title">Log In</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username-input">Name</label>
            <input
              type="text"
              id="username-input"
              placeholder="Enter your name"
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
}

export default Login;
