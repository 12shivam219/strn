import React, { useState } from "react";

export default function ScreenShareButton({
  onStart,
  onStop,
  isSharing,
}: {
  onStart: (stream: MediaStream) => void;
  onStop: () => void;
  isSharing: boolean;
}) {
  const [error, setError] = useState("");

  const handleShare = async () => {
    setError("");
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: false,
      });
      onStart(stream);
    } catch (err: any) {
      setError("Screen sharing cancelled or failed");
    }
  };

  return (
    <div className="my-2">
      <button
        className={`px-4 py-2 rounded font-semibold ${
          isSharing ? "bg-red-600" : "bg-green-600"
        } text-white`}
        onClick={isSharing ? onStop : handleShare}
      >
        {isSharing ? "Stop Sharing" : "Share Screen"}
      </button>
      {error && <div className="text-red-400 text-sm mt-1">{error}</div>}
    </div>
  );
}
