import { useRef, useState } from "react";
import "./style.css";

export const AudioMessage: React.FC<{ src?: string; isOwn?: boolean }> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);

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
      <div style={{ marginLeft: 8 }}>{duration ? `${duration}"` : "..."}</div>
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={onLoaded}
        onEnded={() => setPlaying(false)}
        style={{ display: "none" }}
      />
    </div>
  );
};
