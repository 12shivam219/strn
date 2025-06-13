import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mediasoup from 'mediasoup';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const mediasoupWorkers: any[] = [];
let router: any;
const peers: any = {}; // peerId -> transports, producers, consumers

async function createWorker() {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });

  worker.on('died', () => {
    console.error('Mediasoup worker died. Exiting...');
    process.exit(1);
  });

  mediasoupWorkers.push(worker);
  return worker;
}

async function createRouter() {
  const worker = await createWorker();
  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {},
      },
    ],
  });
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  peers[socket.id] = {
    transports: [],
    producers: [],
    consumers: [],
  };

  socket.on('getRtpCapabilities', (callback) => {
    callback(router.rtpCapabilities);
  });

  socket.on('getRouterRtpCapabilities', (callback) => {
    callback(router.rtpCapabilities);
  });

  socket.on('createProducerTransport', async (callback) => {
    try {
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      peers[socket.id].transports.push(transport);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      console.error('Error creating producer transport:', error);
      callback({ error: (error as Error).message });
    }
  });

  socket.on('connectTransport', async ({ dtlsParameters }, callback) => {
    try {
      const transport = peers[socket.id].transports.slice(-1)[0];
      await transport.connect({ dtlsParameters });
      callback();
    } catch (error) {
      console.error('Error connecting transport:', error);
      callback({ error: (error as Error).message });
    }
  });

  socket.on('produce', async ({ kind, rtpParameters }, callback) => {
    try {
      const transport = peers[socket.id].transports.slice(-1)[0];
      const producer = await transport.produce({ kind, rtpParameters });
      peers[socket.id].producers.push(producer);
      
      // Notify other clients about new producer
      socket.broadcast.emit('newProducer', { producerId: producer.id, kind });
      
      callback({ id: producer.id });
    } catch (error) {
      console.error('Error producing:', error);
      callback({ error: (error as Error).message });
    }
  });

  socket.on('createConsumerTransport', async (rtpCapabilities, callback) => {
    try {
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      peers[socket.id].transports.push(transport);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      console.error('Error creating consumer transport:', error);
      callback({ error: (error as Error).message });
    }
  });

  socket.on('connectConsumerTransport', async ({ dtlsParameters }, callback) => {
    try {
      const transport = peers[socket.id].transports.slice(-1)[0];
      await transport.connect({ dtlsParameters });
      callback();
    } catch (error) {
      console.error('Error connecting consumer transport:', error);
      callback({ error: (error as Error).message });
    }
  });

  socket.on('consume', async ({ kind, rtpCapabilities }, callback) => {
    try {
      // Find a producer of the requested kind from any peer
      const producer = Object.values(peers)
        .flatMap(p => (p as any).producers)
        .find(p => p.kind === kind && !p.closed);

      if (!producer) {
        callback({ error: 'No producer found' });
        return;
      }

      const transport = peers[socket.id].transports.slice(-1)[0];
      
      if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
        callback({ error: 'Cannot consume' });
        return;
      }

      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: false,
      });

      peers[socket.id].consumers.push(consumer);
      
      callback({
        id: consumer.id,
        producerId: producer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (error) {
      console.error('Error consuming:', error);
      callback({ error: (error as Error).message });
    }
  });

  socket.on('resumeConsumer', async ({ consumerId }, callback) => {
    try {
      const consumer = peers[socket.id].consumers.find((c: any) => c.id === consumerId);
      if (consumer) {
        await consumer.resume();
        callback({ success: true });
      } else {
        callback({ error: 'Consumer not found' });
      }
    } catch (error) {
      console.error('Error resuming consumer:', error);
      callback({ error: (error as Error).message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (peers[socket.id]) {
      (peers[socket.id]?.transports || []).forEach((t: any) => t.close());
      (peers[socket.id]?.producers || []).forEach((p: any) => p.close());
      (peers[socket.id]?.consumers || []).forEach((c: any) => c.close());
      delete peers[socket.id];
    }
  });
});

createRouter().then(() => {
  server.listen(3000, () => console.log('✅ Mediasoup server running on http://localhost:3000'));
});