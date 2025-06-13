import React, { useEffect, useRef, useState } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';

const SIGNALING_URL = 'http://localhost:3000'; // Update if needed

export default function AVReceiver() {
  const [status, setStatus] = useState('Idle');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function start() {
      setStatus('Connecting to server...');
      const device = new mediasoupClient.Device();
      const socket = io(SIGNALING_URL);
      await new Promise<void>(resolve => socket.on('connect', () => resolve()));
      const rtpCapabilities = device.rtpCapabilities;
      // Send our capabilities to the server
      const consumerTransportData = await new Promise<any>(resolve => socket.emit('createConsumerTransport', { rtpCapabilities }, (data: any) => resolve(data)));
      const transport = device.createRecvTransport(consumerTransportData);
      transport.on('connect', ({ dtlsParameters }, callback) => {
        socket.emit('connectConsumerTransport', { dtlsParameters }, callback);
      });
      // Request the server to start sending us media
      const { id, kind, rtpParameters } = await new Promise<any>(resolve => socket.emit('consume', { rtpCapabilities }, (data: any) => resolve(data)));
      const consumer = await transport.consume({ id, kind, rtpParameters });
      const stream = new MediaStream([consumer.track]);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus('✅ Receiving stream.');
    }
    start();
  }, []);

  return (
    <div>
      <h2>AV Receiver</h2>
      <p>Status: {status}</p>
      <video ref={videoRef} autoPlay playsInline controls style={{ width: 320 }} />
    </div>
  );
}
