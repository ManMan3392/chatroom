import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { getFullApiServer } from "../../services/api";
import { VideoPlayer } from "./cpns/videoPlayer";
import { AudioMessage } from "./cpns/audioMessage";
import "./style.css";

type MsgType = "text" | "image" | "video" | "audio" | "file";

interface Message {
  type?: string;
  username?: string;
  content?: string;
  ts?: number | string;
  msgType?: MsgType;
  fileName?: string;
}


interface MessageListProps {
  messages: Message[];
  username?: string | null;
  onLoadMore?: (beforeTs: number | string) => Promise<number> | number;
}

function resolveUrl(url?: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("blob:")) return url;

  const apiServer = getFullApiServer();
  return `${apiServer}${url}`;
}




export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  function MessageListComponent({ messages, username, onLoadMore }, ref) {
    const listRef = useRef<HTMLDivElement | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const prevScrollHeightRef = useRef(0);

    const scrollableRef = (ref as React.RefObject<HTMLDivElement>) || listRef;

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
    }, [messages, scrollableRef]);

    const handleScroll = async () => {
      const currentContainer =
        (scrollableRef &&
          (scrollableRef as React.RefObject<HTMLDivElement>).current) ||
        listRef.current;
      if (!currentContainer) return;

      const { scrollTop, scrollHeight } = currentContainer as HTMLDivElement;
      if (scrollTop === 0 && !isLoading && onLoadMore) {
        const firstMsg = messages.find((m: Message) => m.type === "message");
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
      <div
        id="messages"
        ref={scrollableRef as React.RefObject<HTMLDivElement>}
        onScroll={handleScroll}
      >
        {isLoading && (
          <div style={{ textAlign: "center", padding: "10px", color: "#999" }}>
            Loading history...
          </div>
        )}
        {messages.map((msg: Message, index: number) => {
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
  }
);