import React, { useEffect, useRef, useState } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';

const SIGNALING_URL = 'http://localhost:3000'; // Update if needed

export default function AVSender() {
  const [status, setStatus] = useState('Idle');
  const [producerId, setProducerId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    async function start() {
      try {
        setStatus('Requesting media...');
        console.log('Requesting media access...');
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        setStatus('Connecting to server...');
        console.log('Initializing connection...');
        
        const device = new mediasoupClient.Device();
        const socket = io(SIGNALING_URL);
        
        // Debug event listeners
        socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setStatus(`❌ Connection error: ${error.message}`);
        });

        socket.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          setStatus(`Disconnected: ${reason}`);
        });

        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 5000);
          
          socket.on('connect', () => {
            clearTimeout(timeout);
            console.log('Connected to server');
            resolve();
          });
        });

        console.log('Getting RTP capabilities...');
        const rtpCapabilities = await new Promise<any>((resolve, reject) => {
          socket.emit('getRtpCapabilities', (data: any) => {
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data);
            }
          });
        });

        console.log('Loading device...');
        await device.load({ routerRtpCapabilities: rtpCapabilities });

        console.log('Creating producer transport...');
        const transportData = await new Promise<any>((resolve, reject) => {
          socket.emit('createProducerTransport', (data: any) => {
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data);
            }
          });
        });

        console.log('Setting up transport...');
        const transport = device.createSendTransport(transportData);

        transport.on('connect', ({ dtlsParameters }, callback, errback) => {
          console.log('Transport connect event');
          socket.emit('connectTransport', { dtlsParameters }, (response: any) => {
            if (response && response.error) {
              if (errback) errback(new Error(response.error));
            } else {
              callback();
            }
          });
        });

        transport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
          console.log(`Producing ${kind}...`);
          socket.emit('produce', { kind, rtpParameters }, (response: any) => {
            if (response && response.error) {
              if (errback) errback(new Error(response.error));
            } else {
              callback({ id: response.id });
            }
          });
        });

        transport.on('connectionstatechange', (state) => {
          console.log('Transport connection state:', state);
          if (state === 'failed' || state === 'closed') {
            setStatus(`❌ Transport ${state}`);
          }
        });        // Verify media tracks
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        if (!videoTrack) {
          throw new Error('No video track available');
        }

        setStatus('Sending video...');
        console.log('Video track:', {
          enabled: videoTrack.enabled,
          muted: videoTrack.muted,
          readyState: videoTrack.readyState
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
            videoGoogleStartBitrate: 1000
          }
        });
        setProducerId(videoProducer.id);
        
        console.log('Video producer created:', videoProducer.id);
        videoProducer.on('transportclose', () => {
          console.log('Video transport closed');
          setStatus('❌ Video transport closed');
        });

        // Handle audio if available
        if (audioTrack) {
          setStatus('Sending audio...');
          console.log('Audio track:', {
            enabled: audioTrack.enabled,
            muted: audioTrack.muted,
            readyState: audioTrack.readyState
          });

          const audioProducer = await transport.produce({ 
            track: audioTrack,
            codecOptions: {
              opusStereo: true,
              opusDtx: true,
            }
          });
          console.log('Audio producer created:', audioProducer.id);
          
          audioProducer.on('transportclose', () => {
            console.log('Audio transport closed');
          });        } else {
          console.warn('No audio track available');
        }

        setStatus('✅ AV streaming started.');

        setStatus('✅ AV streaming started.');
        console.log('Streaming setup completed successfully');
      } catch (error) {
        console.error('Error in sender:', error);
        if (error instanceof Error) {
          setStatus(`❌ Error: ${error.message}`);
        } else {
          setStatus('❌ Error: Unknown error');
        }
      }
    }
    start();
  }, []);

  return (
    <div>
      <h2>AV Sender</h2>
      <p>Status: {status}</p>
      {producerId && <p>Video Producer ID: {producerId}</p>}
      <video ref={videoRef} autoPlay playsInline muted style={{ width: 320 }} />
    </div>
  );
}
