import React, { useEffect, useRef, useState } from "react";
import { uploadFile } from "../services/api";

// Expose minimal Android native surface via window
declare global {
  interface Window {
    AndroidNative?: {
      startAudioRecording?: () => boolean;
      stopAudioRecording?: () => string | null;
      playVideo?: (src?: string) => void;
    };
  }
}

// Legacy navigator shape for older browsers
interface LegacyNavigator extends Navigator {
  webkitGetUserMedia?: (
    constraints: MediaStreamConstraints,
    onSuccess: (stream: MediaStream) => void,
    onError: (err: unknown) => void
  ) => void;
  mozGetUserMedia?: (
    constraints: MediaStreamConstraints,
    onSuccess: (stream: MediaStream) => void,
    onError: (err: unknown) => void
  ) => void;
}

export interface InputAreaProps {
  onSendMessage?: (
    content: string | null,
    type: "text" | "image" | "video" | "audio" | "file",
    filename?: string | null
  ) => void;
}

const InputArea: React.FC<InputAreaProps> = ({ onSendMessage }) => {
  const [text, setText] = useState("");
  const [showPlus, setShowPlus] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileAccept, setFileAccept] = useState("image/*,video/*,audio/*");
  const [, setUploading] = useState(false);

  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera
  const startCamera = async () => {
    setShowPlus(false);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("您的浏览器不支持相机访问");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setCameraStream(stream);
      setShowCamera(true);
    } catch (err) {
      console.error("Camera error", err);
      alert("无法访问相机，请检查权限设置");
    }
  };

  const stopCameraStream = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  };

  const closeCamera = () => {
    stopCameraStream();
    setShowCamera(false);
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo_${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        closeCamera();
        const url = await uploadFileToServer(file);
        if (url && typeof onSendMessage === "function")
          onSendMessage(url, "image", file.name);
      },
      "image/jpeg",
      0.8
    );
  };

  useEffect(() => {
    if (showCamera && videoRef.current && cameraStream) {
      try {
        videoRef.current.srcObject = cameraStream;
        void videoRef.current.play();
      } catch (e) {
        console.warn("attach stream failed", e);
      }
    }
  }, [showCamera, cameraStream]);

  // Text send
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (typeof onSendMessage === "function")
      onSendMessage(trimmed, "text", null);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Recording (native bridge fallback)
  const startRecording = async () => {
    const android = window.AndroidNative;
    if (android && android.startAudioRecording) {
      try {
        const ok = android.startAudioRecording();
        if (ok) setRecording(true);
        else alert("启动原生录音失败，请检查权限");
      } catch (e) {
        console.error(e);
        alert("调用原生录音出错: " + String(e));
      }
      return;
    }

    try {
      if (typeof MediaRecorder === "undefined") {
        alert("您的浏览器不支持 MediaRecorder，无法录音");
        return;
      }

      // ensure getUserMedia exists (polyfill for very old browsers)
      // Ensure typed access to mediaDevices (avoid `any`)
      const md = navigator as unknown as MediaDevices & {
        getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
      };
      if (!md.getUserMedia) {
        const legacy = navigator as LegacyNavigator;
        const legacyFn = legacy.webkitGetUserMedia || legacy.mozGetUserMedia;
        if (!legacyFn) throw new Error("getUserMedia not implemented");
        md.getUserMedia = (constraints: MediaStreamConstraints) =>
          new Promise<MediaStream>((resolve, reject) =>
            legacyFn.call(navigator, constraints, resolve, reject)
          );
        // write back to navigator.mediaDevices in a typesafe way
        (navigator as unknown as { mediaDevices?: typeof md }).mediaDevices =
          md;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0)
          recordedChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: "audio/webm",
        });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string | null;
          if (dataUrl && typeof onSendMessage === "function")
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
      alert("无法录音: " + String(err));
    }
  };

  const stopRecording = () => {
    const android = window.AndroidNative;
    if (android && android.stopAudioRecording) {
      try {
        const dataUrl = android.stopAudioRecording();
        setRecording(false);
        if (dataUrl && typeof onSendMessage === "function")
          onSendMessage(dataUrl, "audio", "recording.m4a");
        else alert("录音保存失败");
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

  // Upload helper
  const uploadFileToServer = async (
    fileToUpload: File
  ): Promise<string | null> => {
    try {
      setUploading(true);
      const result = await uploadFile("/upload", fileToUpload);
      return (result as { url?: string } | null)?.url ?? null;
    } catch (err) {
      console.error("upload error", err);
      alert("文件上传失败，请稍后重试");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const mime = file.type || "application/octet-stream";
    let msgType: "image" | "video" | "audio" | "file" = "file";
    if (mime.startsWith("image/")) msgType = "image";
    else if (mime.startsWith("video/")) msgType = "video";
    else if (mime.startsWith("audio/")) msgType = "audio";

    try {
      const uploadedUrl = await uploadFileToServer(file);
      if (!uploadedUrl) {
        input.value = "";
        return;
      }
      if (typeof onSendMessage === "function")
        onSendMessage(uploadedUrl, msgType, file.name);
    } finally {
      try {
        input.removeAttribute("capture");
      } catch (e) {
        console.warn("remove capture failed", e);
      }
      input.value = "";
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
                {recording ? "录音中..." : "按住 说话"}
              </button>
            </div>
          ) : (
            <>
              <textarea
                id="message-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
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
          发送
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
          <div className="panel-text">相册</div>
        </div>

        <div className="panel-item" onClick={startCamera}>
          <div className="panel-icon-box icon-camera" />
          <div className="panel-text">拍摄</div>
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
          <div className="panel-text">文件</div>
        </div>
      </div>

      {showCamera && (
        <div className="camera-modal">
          <video
            ref={videoRef}
            className="camera-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <div className="camera-close" onClick={closeCamera}>
            ×
          </div>
          <div className="camera-controls">
            <div className="camera-btn" onClick={takePhoto} />
          </div>
        </div>
      )}
    </>
  );
};

export default InputArea;
