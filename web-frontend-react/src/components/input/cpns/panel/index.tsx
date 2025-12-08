import type { ReactNode, FC } from 'react'
import { memo } from 'react'
import "./style.css";

interface Iprops {
  children?: ReactNode
  showPlus: boolean
  setShowPlus: (show: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  setFileAccept: (accept: string) => void
  setCameraStream: (stream: MediaStream) => void
  setShowCamera: (show: boolean) => void
}
const Panel: FC<Iprops> = ({
  showPlus,
  setShowPlus,
  fileInputRef,
  setFileAccept,
  setCameraStream,
  setShowCamera,
}) => {

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

  return (
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
  )
}
export default memo(Panel)
