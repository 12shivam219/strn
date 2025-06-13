import React, { useEffect, useRef, useState } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';

const SIGNALING_URL = 'http://localhost:3000'; // Update if needed

export default function AVSender() {
  const [status, setStatus] = useState('Idle');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function start() {
      setStatus('Requesting media...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus('Connecting to server...');
      const device = new mediasoupClient.Device();
      const socket = io(SIGNALING_URL);
      await new Promise<void>(resolve => socket.on('connect', () => resolve()));
      const rtpCapabilities = await new Promise<any>(resolve => socket.emit('getRtpCapabilities', (data: any) => resolve(data)));
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      const transportData = await new Promise<any>(resolve => socket.emit('createProducerTransport', (data: any) => resolve(data)));
      const transport = device.createSendTransport(transportData);
      transport.on('connect', ({ dtlsParameters }, callback) => {
        socket.emit('connectTransport', { dtlsParameters }, callback);
      });
      transport.on('produce', ({ kind, rtpParameters }, callback) => {
        socket.emit('produce', { kind, rtpParameters }, callback);
      });
      setStatus('Sending video...');
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) await transport.produce({ track: videoTrack });
      setStatus('Sending audio...');
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) await transport.produce({ track: audioTrack });
      setStatus('✅ AV streaming started.');
    }
    start();
  }, []);

  return (
    <div>
      <h2>AV Sender</h2>
      <p>Status: {status}</p>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: 320 }} />
    </div>
  );
}
