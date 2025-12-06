import React, { useState, useRef, useLayoutEffect, forwardRef } from "react";
import { getFullApiServer } from "../services/api";

function resolveUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("blob:")) return url;

  const apiServer = getFullApiServer();
  return `${apiServer}${url}`;
}

const MessageList = forwardRef(function MessageListComponent(
  { messages, username, onLoadMore },
  ref
) {
  const listRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const prevScrollHeightRef = useRef(0);

  // 使用传入的 ref，如果没有则使用内部 ref
  const scrollableRef = ref || listRef;

  useLayoutEffect(() => {
    const currentRef = scrollableRef.current || listRef.current;
    if (currentRef && prevScrollHeightRef.current > 0) {
      const newScrollHeight = currentRef.scrollHeight;
      const diff = newScrollHeight - prevScrollHeightRef.current;
      if (diff > 0) {
        currentRef.scrollTop = diff;
      }
      prevScrollHeightRef.current = 0;
    }
  }, [messages]);

  const handleScroll = async (e) => {
    const { scrollTop, scrollHeight } = e.target;
    if (scrollTop === 0 && !isLoading && onLoadMore) {
      const firstMsg = messages.find((m) => m.type === "message");
      if (firstMsg && firstMsg.ts) {
        setIsLoading(true);
        prevScrollHeightRef.current = scrollHeight;

        const count = await onLoadMore(firstMsg.ts);

        if (count === 0) {
          prevScrollHeightRef.current = 0;
        }

        setIsLoading(false);
      }
    }
  };

  return (
    <div id="messages" ref={scrollableRef} onScroll={handleScroll}>
      {isLoading && (
        <div style={{ textAlign: "center", padding: "10px", color: "#999" }}>
          Loading history...
        </div>
      )}
      {messages.map((msg, index) => {
        if (msg.type === "system") {
          return (
            <div key={index} className="message system">
              {msg.content}
            </div>
          );
        }

        const isOwn = msg.username === username;
        const resolvedContent = resolveUrl(msg.content);

        return (
          <div key={index} className={`message-row ${isOwn ? "own" : ""}`}>
            <div className="avatar">
              {msg.username ? msg.username[0].toUpperCase() : "?"}
            </div>
            <div className="message-content">
              {!isOwn && <div className="author">{msg.username}</div>}
              <div className="bubble">
                {msg.msgType === "image" ? (
                  <img
                    src={resolvedContent}
                    alt="sent image"
                    style={{ maxWidth: "100%", display: "block" }}
                  />
                ) : msg.msgType === "video" ? (
                  <VideoPlayer src={resolvedContent} />
                ) : msg.msgType === "audio" ? (
                  <AudioMessage src={resolvedContent} isOwn={isOwn} />
                ) : msg.msgType === "file" ? (
                  <a
                    href={resolvedContent}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    File: {msg.fileName || "Download"}
                  </a>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default MessageList;

function AudioMessage({ src, isOwn }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (playing) {
        audio.pause();
        setPlaying(false);
      } else {
        await audio.play();
        setPlaying(true);
      }
    } catch (e) {
      console.warn("audio play error", e);
    }
  };

  const onLoaded = () => {
    const audio = audioRef.current;
    if (audio && audio.duration && isFinite(audio.duration)) {
      setDuration(Math.round(audio.duration));
    }
  };

  return (
    <div className="audio-message" onClick={togglePlay} role="button">
      <span className="audio-icon">{playing ? "▮▮" : "▶"}</span>
      <div style={{ marginLeft: 8 }}>{duration ? `${duration}\"` : "..."}</div>
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={onLoaded}
        onEnded={() => setPlaying(false)}
        style={{ display: "none" }}
      />
    </div>
  );
}

function inferMimeFromUrl(url) {
  if (!url) return "video/mp4";
  const parts = url.split("?")[0].split(".");
  const ext = parts[parts.length - 1].toLowerCase();
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "ogg":
    case "ogv":
      return "video/ogg";
    case "mov":
      return "video/quicktime";
    default:
      return "video/mp4";
  }
}

function VideoPlayer({ src }) {
  const [error, setError] = useState(false);
  const [meta, setMeta] = useState({ width: 0, height: 0, duration: 0 });
  const [canPlay, setCanPlay] = useState(false);
  const [diagnostic, setDiagnostic] = useState(null);
  const videoRef = useRef(null);
  const mime = inferMimeFromUrl(src);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setMeta({
      width: v.videoWidth,
      height: v.videoHeight,
      duration: v.duration,
    });
  };

  const handleCanPlay = () => {
    setCanPlay(true);
  };

  const handleError = (e) => {
    const v = videoRef.current;
    let info = { code: null, message: null };
    try {
      if (v && v.error) {
        info.code = v.error.code;
        // Some browsers provide a message on the error event
        info.message = v.error.message || JSON.stringify(v.error);
      }
    } catch (err) {
      // ignore
    }
    setDiagnostic({
      event: e?.type || "error",
      readyState: v ? v.readyState : null,
      networkState: v ? v.networkState : null,
      info,
    });
    setError(true);
    console.warn("video error diagnostic", src, diagnostic, e);
  };

  const openInNewTab = () => {
    try {
      window.open(src, "_blank");
    } catch (err) {
      console.warn("open new tab failed", err);
    }
  };

  const openWithNative = () => {
    try {
      if (
        window.AndroidNative &&
        typeof window.AndroidNative.playVideo === "function"
      ) {
        window.AndroidNative.playVideo(src);
      } else if (
        window.webkit &&
        window.webkit.messageHandlers &&
        window.webkit.messageHandlers.playVideo
      ) {
        window.webkit.messageHandlers.playVideo.postMessage(src);
      } else {
        openInNewTab();
      }
    } catch (err) {
      console.warn("native open failed", err);
      openInNewTab();
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#000",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "stretch",
      }}
    >
      <div style={{ position: "relative" }}>
        {!error ? (
          <video
            ref={videoRef}
            controls
            playsInline
            webkit-playsinline="true"
            style={{
              maxWidth: "100%",
              height: "auto",
              display: "block",
              backgroundColor: "#000",
            }}
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={handleCanPlay}
            onError={handleError}
          >
            <source src={src} type={mime} />
            您的浏览器不支持该视频标签。
          </video>
        ) : (
          <div style={{ padding: 12 }}>
            <div style={{ color: "#fff", marginBottom: 8 }}>视频无法播放</div>
            <div style={{ color: "#ccc", fontSize: 12, marginBottom: 8 }}>
              建议：在新标签页打开或下载后用系统/第三方播放器尝试。
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={openInNewTab}>在新标签页打开</button>
              <a href={src} download style={{ color: "inherit" }}>
                <button>下载</button>
              </a>
              <button onClick={openWithNative}>用原生打开</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
