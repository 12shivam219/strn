import React, { useState } from "react";
import Controls from "../components/Controls";
import AVSender from "../components/AVSender";
import AVReceiver from "../components/AVReceiver";
import Auth from "../components/Auth";
import Chat from "../components/Chat";

const Home = () => {
  const [user, setUser] = useState<{
    username: string;
    streamId: string;
    token?: string;
  } | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [joined, setJoined] = useState(false);

  if (!user) {
    return <Auth onAuth={setUser} />;
  }

  if (!joined) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            🎥 CrossStream
          </h1>
          <p className="text-gray-400 text-lg">
            Welcome, {user.username}! Your Stream ID:{" "}
            <span className="font-mono text-green-400">{user.streamId}</span>
          </p>
        </div>
        <div className="max-w-md mx-auto bg-gray-800 p-6 rounded-lg mt-8">
          <h2 className="text-xl font-bold mb-4 text-center">
            Join or Create a Room
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (roomId) setJoined(true);
            }}
            className="space-y-4"
          >
            <input
              className="w-full p-2 rounded bg-gray-700 text-white"
              placeholder="Room ID (any string)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              Join Room
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          🎥 CrossStream
        </h1>
        <p className="text-gray-400 text-lg">
          Welcome, {user.username}! Room:{" "}
          <span className="font-mono text-green-400">{roomId}</span>
        </p>
      </div>
      <div className="max-w-md mx-auto">
        <Controls />
      </div>
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>Ready to stream audio and video across platforms</p>
      </div>
      <Chat
        roomId={roomId}
        token={user.token || user.streamId}
        username={user.username}
      />
      <div className="mt-8 flex flex-col md:flex-row justify-center gap-8">
        <AVSender roomId={roomId} token={user.token || user.streamId} />
        <AVReceiver roomId={roomId} token={user.token || user.streamId} />
      </div>
    </div>
  );
};

export default Home;
