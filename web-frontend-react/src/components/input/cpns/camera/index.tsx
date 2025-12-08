import type { ReactNode, FC } from 'react'
import { memo } from 'react'
import "./style.css";

interface Iprops {
  children?: ReactNode
    closeCamera: () => void
    takePhoto: () => void
    videoRef: React.RefObject<HTMLVideoElement | null>
    canvasRef: React.RefObject<HTMLCanvasElement | null>
}
const Camera: FC<Iprops> = ({ closeCamera, takePhoto, videoRef, canvasRef }) => {
  return (
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
  )
}
export default memo(Camera)
