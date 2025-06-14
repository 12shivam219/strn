import React, { useEffect, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import { io } from "socket.io-client";
import ScreenShareButton from "./ScreenShareButton";

const SIGNALING_URL = "http://localhost:3000";

export default function AVSender({
  roomId,
  token,
}: {
  roomId: string;
  token: string;
}) {
  const [status, setStatus] = useState("Idle");
  const [producerId, setProducerId] = useState<string | null>(null);
  const [screenProducerId, setScreenProducerId] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const deviceRef = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const transportRef = useRef<any>(null);
  const screenProducerRef = useRef<any>(null);

  useEffect(() => {
    async function start() {
      try {
        setStatus("Requesting media...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("Connecting to server...");
        const device = new mediasoupClient.Device();
        deviceRef.current = device;
        const socket = io(SIGNALING_URL, { query: { token } });
        socketRef.current = socket;
        await new Promise<void>((resolve, reject) => {
          socket.emit("joinRoom", { roomId }, (resp: any) => {
            if (resp && resp.success) resolve();
            else reject(new Error(resp?.error || "Failed to join room"));
          });
        });

        console.log("Getting RTP capabilities...");
        const rtpCapabilities = await new Promise<any>((resolve, reject) => {
          socket.emit("getRtpCapabilities", (data: any) => {
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data);
            }
          });
        });

        console.log("Loading device...");
        await device.load({ routerRtpCapabilities: rtpCapabilities });

        console.log("Creating producer transport...");
        const transportData = await new Promise<any>((resolve, reject) => {
          socket.emit("createProducerTransport", (data: any) => {
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data);
            }
          });
        });

        console.log("Setting up transport...");
        const transport = device.createSendTransport(transportData);

        transport.on("connect", ({ dtlsParameters }, callback, errback) => {
          console.log("Transport connect event");
          socket.emit(
            "connectTransport",
            { dtlsParameters },
            (response: any) => {
              if (response && response.error) {
                if (errback) errback(new Error(response.error));
              } else {
                callback();
              }
            }
          );
        });

        transport.on(
          "produce",
          ({ kind, rtpParameters }, callback, errback) => {
            console.log(`Producing ${kind}...`);
            socket.emit("produce", { kind, rtpParameters }, (response: any) => {
              if (response && response.error) {
                if (errback) errback(new Error(response.error));
              } else {
                callback({ id: response.id });
              }
            });
          }
        );

        transport.on("connectionstatechange", (state) => {
          console.log("Transport connection state:", state);
          if (state === "failed" || state === "closed") {
            setStatus(`❌ Transport ${state}`);
          }
        }); // Verify media tracks
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        if (!videoTrack) {
          throw new Error("No video track available");
        }

        setStatus("Sending video...");
        console.log("Video track:", {
          enabled: videoTrack.enabled,
          muted: videoTrack.muted,
          readyState: videoTrack.readyState,
        });

        // Produce video
        const videoProducer = await transport.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 100000 },
            { maxBitrate: 300000 },
            { maxBitrate: 900000 },
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
        });
        setProducerId(videoProducer.id);

        console.log("Video producer created:", videoProducer.id);
        videoProducer.on("transportclose", () => {
          console.log("Video transport closed");
          setStatus("❌ Video transport closed");
        });

        // Handle audio if available
        if (audioTrack) {
          setStatus("Sending audio...");
          console.log("Audio track:", {
            enabled: audioTrack.enabled,
            muted: audioTrack.muted,
            readyState: audioTrack.readyState,
          });

          const audioProducer = await transport.produce({
            track: audioTrack,
            codecOptions: {
              opusStereo: true,
              opusDtx: true,
            },
          });
          console.log("Audio producer created:", audioProducer.id);

          audioProducer.on("transportclose", () => {
            console.log("Audio transport closed");
          });
        } else {
          console.warn("No audio track available");
        }

        setStatus("✅ AV streaming started.");

        setStatus("✅ AV streaming started.");
        console.log("Streaming setup completed successfully");
      } catch (error) {
        console.error("Error in sender:", error);
        if (error instanceof Error) {
          setStatus(`❌ Error: ${error.message}`);
        } else {
          setStatus("❌ Error: Unknown error");
        }
      }
    }
    start();
  }, [roomId, token]);

  // Screen sharing logic
  const startScreenShare = async (screenStream: MediaStream) => {
    setIsSharing(true);
    setStatus("Sharing screen...");
    try {
      const device = deviceRef.current;
      const socket = socketRef.current;
      // Create a new transport for screen
      const transportData = await new Promise<any>((resolve, reject) => {
        socket.emit("createProducerTransport", (data: any) => {
          if (data.error) reject(new Error(data.error));
          else resolve(data);
        });
      });
      const transport = device.createSendTransport(transportData);
      transportRef.current = transport;
      transport.on(
        "connect",
        ({ dtlsParameters }: any, callback: any, errback: any) => {
          socket.emit(
            "connectTransport",
            { dtlsParameters },
            (response: any) => {
              if (response && response.error)
                errback(new Error(response.error));
              else callback();
            }
          );
        }
      );
      transport.on(
        "produce",
        ({ kind, rtpParameters }: any, callback: any, errback: any) => {
          socket.emit("produce", { kind, rtpParameters }, (response: any) => {
            if (response && response.error) errback(new Error(response.error));
            else callback({ id: response.id });
          });
        }
      );
      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("No video track in screen stream");
      const screenProducer = await transport.produce({
        track: videoTrack,
        appData: { screen: true },
      });
      setScreenProducerId(screenProducer.id);
      screenProducerRef.current = screenProducer;
      screenProducer.on("transportclose", () => {
        setIsSharing(false);
        setScreenProducerId(null);
        setStatus("Screen share stopped");
      });
      videoTrack.onended = () => {
        screenProducer.close();
        setIsSharing(false);
        setScreenProducerId(null);
        setStatus("Screen share stopped");
      };
    } catch (err) {
      setStatus("❌ Screen share error");
      setIsSharing(false);
    }
  };

  const stopScreenShare = () => {
    if (screenProducerRef.current) {
      screenProducerRef.current.close();
      setIsSharing(false);
      setScreenProducerId(null);
      setStatus("Screen share stopped");
    }
  };

  return (
    <div>
      <h2>AV Sender</h2>
      <p>Status: {status}</p>
      {producerId && <p>Video Producer ID: {producerId}</p>}
      {screenProducerId && <p>Screen Producer ID: {screenProducerId}</p>}
      <video ref={videoRef} autoPlay playsInline muted style={{ width: 320 }} />
      <ScreenShareButton
        onStart={startScreenShare}
        onStop={stopScreenShare}
        isSharing={isSharing}
      />
    </div>
  );
}
