import React, { useEffect, useRef, useState } from "react";
import Panel from "./cpns/panel";
import Camera from "./cpns/camera";
import InputArea from "./cpns/inputArea";
import { uploadFile } from "../../services/api";
import './style.css'

declare global {
  interface Window {
    AndroidNative?: {
      startAudioRecording?: () => boolean;
      stopAudioRecording?: () => string | null;
      playVideo?: (src?: string) => void;
    };
  }
}


export interface InputAreaProps {
  onSendMessage?: (
    content: string | null,
    type: "text" | "image" | "video" | "audio" | "file",
    filename?: string | null
  ) => void;
}

const Inputs: React.FC<InputAreaProps> = ({ onSendMessage }) => {
  const [showPlus, setShowPlus] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileAccept, setFileAccept] = useState("image/*,video/*,audio/*");
  const [, setUploading] = useState(false);

  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  return (
    <>
      <InputArea
        onSendMessage={onSendMessage}
        fileInputRef={fileInputRef}
        setShowPlus={setShowPlus}
        fileAccept={fileAccept}
        uploadFileToServer={uploadFileToServer}
      />

      {showPlus && (
        <Panel
          showPlus={showPlus}
          setShowPlus={setShowPlus}
          fileInputRef={fileInputRef}
          setFileAccept={setFileAccept}
          setCameraStream={setCameraStream}
          setShowCamera={setShowCamera}
        />
      )}

      {showCamera && (
        <Camera
          closeCamera={() => setShowCamera(false)}
          takePhoto={takePhoto}
          videoRef={videoRef}
          canvasRef={canvasRef}
        />
      )}
    </>
  );
};

export default Inputs;
