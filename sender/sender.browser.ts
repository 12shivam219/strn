import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';

const SIGNALING_URL = 'http://localhost:3000'; // Replace with actual server

const device = new mediasoupClient.Device();
const socket = io(SIGNALING_URL);

export async function startSender(videoStream: MediaStream, audioStream: MediaStream) {
  // Combine streams
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioStream.getAudioTracks()
  ]);

  // Connect to signaling - fix: don't expect parameters from 'connect' event
  await new Promise<void>(resolve => socket.on('connect', () => resolve()));

  // Get RTP Capabilities from server
  const rtpCapabilities = await new Promise<any>(resolve =>
    socket.emit('getRtpCapabilities', (data: any) => resolve(data))
  );

  await device.load({ routerRtpCapabilities: rtpCapabilities });

  // Create a producer transport
  const transportData = await new Promise<any>(resolve =>
    socket.emit('createProducerTransport', (data: any) => resolve(data))
  );
  
  const transport = device.createSendTransport(transportData);

  // Signal events
  transport.on('connect', ({ dtlsParameters }, callback) => {
    socket.emit('connectTransport', { dtlsParameters }, callback);
  });

  transport.on('produce', ({ kind, rtpParameters }, callback) => {
    socket.emit('produce', { kind, rtpParameters }, callback);
  });

  // Send video
  const videoTrack = combinedStream.getVideoTracks()[0];
  if (videoTrack) {
    await transport.produce({ track: videoTrack });
  }

  // Send audio
  const audioTrack = combinedStream.getAudioTracks()[0];
  if (audioTrack) {
    await transport.produce({ track: audioTrack });
  }

  console.log('✅ AV streaming started (browser/Electron).');
}
