import React, { useEffect, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import { io } from "socket.io-client";

const SIGNALING_URL = "https://auth-streaming-server.victoriouswater-bf2045fa.centralindia.azurecontainerapps.io"; // Direct auth-streaming-server URL
const MAX_RETRIES = 10;
const RETRY_DELAY = 1000; // ms

let retryTimeout: NodeJS.Timeout | null = null;

export default function AVReceiver({
  roomId,
  token,
}: {
  roomId: string;
  token: string;
}) {
  const [status, setStatus] = useState("Idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    async function start() {
      try {
        setStatus("Connecting to server...");
        const device = new mediasoupClient.Device();
        const socket = io(SIGNALING_URL, { query: { token } });
        socketRef.current = socket;

        // Debug event listeners
        socket.on("connect_error", (error) => {
          if (!isMounted) return;
          console.error("Socket connection error:", error);
          setStatus(`❌ Connection error: ${error.message}`);
        });
        socket.on("connect_timeout", () => {
          if (!isMounted) return;
          console.error("Socket connection timeout");
          setStatus("❌ Connection timeout");
        });
        socket.on("disconnect", (reason) => {
          if (!isMounted) return;
          console.log("Socket disconnected:", reason);
          setStatus(`Disconnected: ${reason}`);
        });

        // Wait for socket connection (with timeout)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error("Connection timeout"));
          }, 7000);
          socket.on("connect", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (!isMounted) return;
        setStatus("Connected to server.");

        // Join room
        await new Promise<void>((resolve, reject) => {
          socket.emit("joinRoom", { roomId }, (resp: any) => {
            if (resp && resp.success) resolve();
            else reject(new Error(resp?.error || "Failed to join room"));
          });
        });
        if (!isMounted) return;
        setStatus("Joined room.");

        // Get router RTP capabilities
        const routerRtpCapabilities = await new Promise<any>(
          (resolve, reject) =>
            socket.emit("getRtpCapabilities", (data: any) => {
              if (data?.error) reject(new Error(data.error));
              else resolve(data);
            })
        );
        if (!isMounted) return;
        await device.load({ routerRtpCapabilities });

        // Consume camera video
        const consumerTransportData = await new Promise<any>(
          (resolve, reject) =>
            socket.emit(
              "createConsumerTransport",
              {
                rtpCapabilities: device.rtpCapabilities,
              },
              (data: any) => {
                if (data?.error) reject(new Error(data.error));
                else resolve(data);
              }
            )
        );
        const transport = device.createRecvTransport(consumerTransportData);
        transport.on("connect", ({ dtlsParameters }: any, callback: any) => {
          socket.emit("connectConsumerTransport", { dtlsParameters }, callback);
        });
        transport.on("connectionstatechange", (state: any) => {
          if (state === "failed" || state === "closed") {
            setStatus("❌ Transport connection failed");
          }
        });
        // Helper to consume a kind (video, screen)
        async function tryConsume(
          kind: string,
          ref: React.RefObject<HTMLVideoElement>,
          attempt = 1
        ) {
          if (!isMounted) return;
          const result = await new Promise<any>((resolve) =>
            socket.emit(
              "consume",
              {
                kind,
                rtpCapabilities: device.rtpCapabilities,
              },
              (data: any) => resolve(data)
            )
          );
          if (result.error) {
            if (attempt < MAX_RETRIES) {
              setStatus(
                `Retrying to consume ${kind}... (attempt ${attempt + 1})`
              );
              retryTimeout = setTimeout(
                () => tryConsume(kind, ref, attempt + 1),
                RETRY_DELAY
              );
            } else {
              setStatus(`❌ Error: Failed to consume ${kind}: ${result.error}`);
            }
            return;
          }
          const consumer = await transport.consume(result);
          const stream = new MediaStream([consumer.track]);
          if (ref.current) {
            ref.current.srcObject = stream;
          }
          setStatus(`Playing received ${kind}.`);
        }
        // Consume camera video
        tryConsume("video", videoRef);
        // Consume screen if available
        tryConsume("screen", screenRef);
      } catch (error) {
        setStatus(
          `❌ Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }

      return () => {
        isMounted = false;
        if (retryTimeout) {
          clearTimeout(retryTimeout);
          retryTimeout = null;
        }
        socketRef.current?.disconnect();
        setStatus("Idle");
      };
    }

    start();

    return () => {
      // Cleanup function
      socketRef.current?.disconnect();
    };
  }, [roomId, token]);

  return (
    <div>
      <h1>AV Receiver</h1>
      <p>Status: {status}</p>
      <video ref={videoRef} autoPlay playsInline style={{ width: "100%" }} />
      <div className="mt-2">
        <h3 className="text-sm text-gray-400">Screen Share</h3>
        <video
          ref={screenRef}
          autoPlay
          playsInline
          style={{
            width: "100%",
            border: "2px solid #4f46e5",
          }}
        />
      </div>
    </div>
  );
}
