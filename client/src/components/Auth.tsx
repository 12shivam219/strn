import React, { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "https://auth-streaming-server.victoriouswater-bf2045fa.centralindia.azurecontainerapps.io/api";

export default function Auth({
  onAuth,
}: {
  onAuth: (user: { username: string; streamId: string }) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onAuth({ username, streamId: data.streamId });
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-gray-800 p-6 rounded-lg mt-8">
      <h2 className="text-xl font-bold mb-4 text-center">
        {mode === "login" ? "Login" : "Register"} to CrossStream
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full p-2 rounded bg-gray-700 text-white"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          className="w-full p-2 rounded bg-gray-700 text-white"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <button
          type="submit"
          className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          disabled={loading}
        >
          {loading ? "Processing..." : mode === "login" ? "Login" : "Register"}
        </button>
      </form>
      <div className="text-center mt-4">
        <button
          className="text-blue-400 hover:underline text-sm"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login"
            ? "Need an account? Register"
            : "Already have an account? Login"}
        </button>
      </div>
    </div>
  );
}
