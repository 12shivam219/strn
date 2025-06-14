import React, { useEffect, useRef, useState } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';

const SIGNALING_URL = 'http://localhost:3000'; // CHANGE THIS to your public server IP/domain for remote connections
const MAX_RETRIES = 10;
const RETRY_DELAY = 1000; // ms

let retryTimeout: NodeJS.Timeout | null = null;

export default function AVReceiver() {
  const [status, setStatus] = useState('Idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    async function start() {
      try {
        setStatus('Connecting to server...');
        const device = new mediasoupClient.Device();
        const socket = io(SIGNALING_URL, { timeout: 5000 });
        socketRef.current = socket;

        // Debug event listeners
        socket.on('connect_error', (error) => {
          if (!isMounted) return;
          console.error('Socket connection error:', error);
          setStatus(`❌ Connection error: ${error.message}`);
        });
        socket.on('connect_timeout', () => {
          if (!isMounted) return;
          console.error('Socket connection timeout');
          setStatus('❌ Connection timeout');
        });
        socket.on('disconnect', (reason) => {
          if (!isMounted) return;
          console.log('Socket disconnected:', reason);
          setStatus(`Disconnected: ${reason}`);
        });

        // Wait for socket connection (with timeout)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 7000);
          socket.on('connect', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (!isMounted) return;
        setStatus('Connected to server.');

        // Get router RTP capabilities
        const routerRtpCapabilities = await new Promise<any>((resolve, reject) =>
          socket.emit('getRtpCapabilities', (data: any) => {
            if (data?.error) reject(new Error(data.error));
            else resolve(data);
          })
        );
        if (!isMounted) return;
        await device.load({ routerRtpCapabilities });

        // Create consumer transport
        const consumerTransportData = await new Promise<any>((resolve, reject) =>
          socket.emit('createConsumerTransport', {
            rtpCapabilities: device.rtpCapabilities
          }, (data: any) => {
            if (data?.error) reject(new Error(data.error));
            else resolve(data);
          })
        );
        if (!isMounted) return;
        const transport = device.createRecvTransport(consumerTransportData);
        transport.on('connect', ({ dtlsParameters }, callback) => {
          socket.emit('connectConsumerTransport', { dtlsParameters }, callback);
        });
        transport.on('connectionstatechange', (state) => {
          if (state === 'failed' || state === 'closed') {
            setStatus('❌ Transport connection failed');
          }
        });
        // Retry logic for consuming video
        async function tryConsume(attempt = 1) {
          if (!isMounted) return;
          const videoResult = await new Promise<any>(resolve =>
            socket.emit('consume', {
              kind: 'video',
              rtpCapabilities: device.rtpCapabilities
            }, (data: any) => resolve(data))
          );
          if (videoResult.error) {
            if (attempt < MAX_RETRIES) {
              setStatus(`Retrying to consume video... (attempt ${attempt + 1})`);
              retryTimeout = setTimeout(() => tryConsume(attempt + 1), RETRY_DELAY);
            } else {
              setStatus(`❌ Error: Failed to consume video: ${videoResult.error}`);
            }
            return;
          }
          const videoConsumer = await transport.consume(videoResult);
          const videoStream = new MediaStream([videoConsumer.track]);
          if (videoRef.current) {
            videoRef.current.srcObject = videoStream;
          }
          setStatus('Playing received video.');
        }
        tryConsume();
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error in receiver:', error);
          setStatus(`❌ Error: ${error.message}`);
        } else {
          console.error('Unknown error in receiver:', error);
          setStatus('❌ Error: Unknown error');
        }
      }

      return () => {
        isMounted = false;
        if (retryTimeout) {
          clearTimeout(retryTimeout);
          retryTimeout = null;
        }
        socketRef.current?.disconnect();
        setStatus('Idle');
      };
    }

    start();

    return () => {
      // Cleanup function
      socketRef.current?.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>AV Receiver</h1>
      <p>Status: {status}</p>
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%' }} />
    </div>
  );
}
