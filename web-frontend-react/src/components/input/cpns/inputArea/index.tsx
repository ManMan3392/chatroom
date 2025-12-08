import type { ReactNode, FC } from "react";
import { memo, useRef, useState } from "react";
import "./style.css";

interface Iprops {
  children?: ReactNode;
  onSendMessage?: (
    content: string | null,
    type: "text" | "image" | "video" | "audio" | "file",
    filename?: string | null
  ) => void;
  uploadFileToServer: (file: File) => Promise<string | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setShowPlus: (show: boolean) => void;
  fileAccept: string;
}

const InputArea: FC<Iprops> = ({
  onSendMessage,
  uploadFileToServer,
  fileInputRef,
  setShowPlus,
  fileAccept,
}) => {
  const [voiceMode, setVoiceMode] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

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
      <div className="plus-icon" onClick={() => setShowPlus(true)} />
      <button
        id="send-button"
        onClick={handleSend}
        disabled={text.trim().length === 0}
      >
        发送
      </button>
    </div>
  );
};
export default memo(InputArea);
