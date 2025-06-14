import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SIGNALING_URL = "http://localhost:3000";

export default function Chat({
  roomId,
  token,
  username,
}: {
  roomId: string;
  token: string;
  username: string;
}) {
  const [messages, setMessages] = useState<
    { username: string; message: string }[]
  >([]);
  const [input, setInput] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = io(SIGNALING_URL, { query: { token } });
    socketRef.current = socket;
    socket.emit("joinRoom", { roomId }, () => {});
    socket.on("chatMessage", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    return () => {
      socket.disconnect();
    };
  }, [roomId, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    socketRef.current?.emit("chatMessage", {
      roomId,
      message: input,
      username,
    });
    setInput("");
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 max-w-md mx-auto mt-4">
      <div className="h-48 overflow-y-auto mb-2 bg-gray-900 rounded p-2">
        {messages.map((msg, i) => (
          <div key={i} className="mb-1">
            <span className="font-bold text-blue-400">{msg.username}: </span>
            <span>{msg.message}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          className="flex-1 p-2 rounded bg-gray-700 text-white"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button
          type="submit"
          className="bg-blue-600 px-4 py-2 rounded text-white font-semibold"
        >
          Send
        </button>
      </form>
    </div>
  );
}
