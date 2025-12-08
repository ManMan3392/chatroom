import { useRef, useState } from "react";

function inferMimeFromUrl(url?: string) {
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

export function VideoPlayer({ src }: { src?: string }) {
  const [error, setError] = useState(false);
  const [, setMeta] = useState({ width: 0, height: 0, duration: 0 });
  const [, setCanPlay] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Record<string, unknown> | null>(
    null
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
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

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = videoRef.current;
    const info: { code: number | null; message: string | null } = {
      code: null,
      message: null,
    };
    try {
      if (v) {
        const videoAny = v as HTMLVideoElement & {
          error?: { code?: number; message?: string };
        };
        if (videoAny.error) {
          const errObj = videoAny.error;
          info.code = errObj.code ?? null;
          // Some browsers provide a message on the error event
          info.message = errObj.message
            ? String(errObj.message)
            : JSON.stringify(videoAny.error);
        }
      }
    } catch (_err) {
      void _err;
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
      const w = window as unknown as {
        AndroidNative?: { playVideo?: (s?: string) => void };
        webkit?: {
          messageHandlers?: {
            playVideo?: { postMessage: (s?: string) => void };
          };
        };
      };
      if (w.AndroidNative && typeof w.AndroidNative.playVideo === "function") {
        w.AndroidNative.playVideo(src);
      } else if (
        w.webkit &&
        w.webkit.messageHandlers &&
        w.webkit.messageHandlers.playVideo
      ) {
        w.webkit.messageHandlers.playVideo.postMessage(src);
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
