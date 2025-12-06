import React, { useState, useRef } from "react";
import { uploadFile } from "../services/api";

function InputArea({ onSendMessage }) {
  const [text, setText] = useState("");
  const [showPlus, setShowPlus] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const [fileAccept, setFileAccept] = useState("image/*,video/*,audio/*");
  const [uploading, setUploading] = useState(false);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (typeof onSendMessage === "function")
      onSendMessage(trimmed, "text", null);
    setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = async () => {
    if (window.AndroidNative && window.AndroidNative.startAudioRecording) {
      try {
        const success = window.AndroidNative.startAudioRecording();
        if (success) {
          setRecording(true);
        } else {
          alert("启动原生录音失败，请检查权限");
        }
      } catch (e) {
        console.error(e);
        alert("调用原生录音出错: " + e.message);
      }
      return;
    }

    try {
      if (!window.MediaRecorder) {
        alert("您的浏览器不支持 MediaRecorder，无法录音");
        return;
      }

      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      if (!navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia = function (constraints) {
          const getUserMedia =
            navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
          if (!getUserMedia) {
            if (!window.AndroidNative) {
              return Promise.reject(
                new Error(
                  "未检测到原生接口。请确保您已在真机上重新安装了最新版 App (APK)，而不仅仅是刷新网页。"
                )
              );
            }
            return Promise.reject(
              new Error("getUserMedia is not implemented in this browser")
            );
          }
          return new Promise(function (resolve, reject) {
            getUserMedia.call(navigator, constraints, resolve, reject);
          });
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: "audio/webm",
        });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          if (typeof onSendMessage === "function")
            onSendMessage(dataUrl, "audio", "recording.webm");
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      mr.start();
      setRecording(true);
    } catch (err) {
      console.error("录音权限或设备错误", err);
      alert("无法录音: " + err.message);
    }
  };

  const stopRecording = () => {
    if (window.AndroidNative && window.AndroidNative.stopAudioRecording) {
      try {
        const dataUrl = window.AndroidNative.stopAudioRecording();
        setRecording(false);
        if (dataUrl) {
          if (typeof onSendMessage === "function") {
            onSendMessage(dataUrl, "audio", "recording.m4a");
          }
        } else {
          alert("录音保存失败");
        }
      } catch (e) {
        console.error(e);
      }
      return;
    }

    try {
      mediaRecorderRef.current?.stop();
    } catch (e) {
      console.warn(e);
    }
  };

  const uploadFileToServer = async (fileToUpload) => {
    try {
      setUploading(true);

      const result = await uploadFile("/upload", fileToUpload);
      return result.url;
    } catch (err) {
      console.error("upload error", err);
      alert("文件上传失败，请稍后重试");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;

    const mime = file.type || "application/octet-stream";
    let msgType = "file";
    if (mime.startsWith("image/")) msgType = "image";
    else if (mime.startsWith("video/")) msgType = "video";
    else if (mime.startsWith("audio/")) msgType = "audio";

    let fileForUpload = file;

    try {
      const uploadedUrl = await uploadFileToServer(fileForUpload);
      if (!uploadedUrl) {
        input.value = null;
        return;
      }

      if (typeof onSendMessage === "function")
        onSendMessage(uploadedUrl, msgType, file.name);
    } finally {
      try {
        input.removeAttribute("capture");
      } catch (e) {}
      input.value = null;
    }
  };

  return (
    <>
      <div id="input-area">
        <div className="voice-icon" onClick={() => setVoiceMode((v) => !v)} />

        <div className="input-wrapper">
          {voiceMode ? (
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button
                id="voice-hold-btn"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
              >
                {recording ? "Recording..." : "Hold to Talk"}
              </button>
            </div>
          ) : (
            <>
              <textarea
                id="message-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept={fileAccept}
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </>
          )}
        </div>

        <div className="emoji-icon" onClick={() => setText((t) => t + "🙂")} />

        <div className="plus-icon" onClick={() => setShowPlus((s) => !s)} />

        <button
          id="send-button"
          onClick={handleSend}
          disabled={text.trim().length === 0}
        >
          Send
        </button>
      </div>

      <div id="plus-panel" className={showPlus ? "open" : ""}>
        <div
          className="panel-item"
          onClick={() => {
            setFileAccept("image/*,video/*");
            if (fileInputRef.current) {
              fileInputRef.current.removeAttribute("capture");
              fileInputRef.current.click();
            }
            setShowPlus(false);
          }}
        >
          <div className="panel-icon-box icon-image" />
          <div className="panel-text">Photo/Video</div>
        </div>

        <div
          className="panel-item"
          onClick={() => {
            setFileAccept("image/*");
            if (fileInputRef.current) {
              try {
                fileInputRef.current.setAttribute("capture", "environment");
              } catch (e) {}
              fileInputRef.current.click();
            }
            setShowPlus(false);
          }}
        >
          <div className="panel-icon-box icon-camera" />
          <div className="panel-text">Camera</div>
        </div>

        <div
          className="panel-item"
          onClick={() => {
            setFileAccept("*/*");
            if (fileInputRef.current) {
              fileInputRef.current.removeAttribute("capture");
              fileInputRef.current.click();
            }
            setShowPlus(false);
          }}
        >
          <div className="panel-icon-box icon-file" />
          <div className="panel-text">File</div>
        </div>
      </div>
    </>
  );
}

export default InputArea;
