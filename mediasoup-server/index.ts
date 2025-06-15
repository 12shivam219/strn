import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mediasoup from 'mediasoup';
import cors from 'cors';
import Redis from 'ioredis';
import client from 'prom-client';
import fs from 'fs';
import path from 'path';

const app = express();
const server = http.createServer(app);
const CLIENT_ORIGIN = "https://client.victoriouswater-bf2045fa.centralindia.azurecontainerapps.io";
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}));
app.use(express.json());

// Redis setup for pub/sub and distributed state
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redis = new Redis(redisPort, redisHost);
const pub = new Redis(redisPort, redisHost);
const sub = new Redis(redisPort, redisHost);

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();
const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
});

const mediasoupWorkers: any[] = [];
let router: any;

// Redis-based room and peer state
// Each room is a Redis hash: room:{roomId} -> { peers: [peerId, ...] }
// Each peer is a Redis hash: peer:{peerId} -> { transports, producers, consumers, roomId }

// Helper functions for Redis state
async function addPeerToRoom(roomId: string, peerId: string) {
  await redis.sadd(`room:${roomId}:peers`, peerId);
  await redis.hset(`peer:${peerId}`, 'roomId', roomId);
}
async function removePeerFromRoom(roomId: string, peerId: string) {
  await redis.srem(`room:${roomId}:peers`, peerId);
  await redis.del(`peer:${peerId}`);
}
async function getPeersInRoom(roomId: string) {
  return await redis.smembers(`room:${roomId}:peers`);
}
async function setPeerData(peerId: string, key: string, value: string) {
  await redis.hset(`peer:${peerId}`, key, value);
}
async function getPeerData(peerId: string, key: string) {
  return await redis.hget(`peer:${peerId}`, key);
}

// Helper for storing/retrieving JSON arrays in Redis
async function setPeerArray(peerId: string, key: string, arr: any[]) {
  await redis.hset(`peer:${peerId}`, key, JSON.stringify(arr));
}
async function getPeerArray(peerId: string, key: string) {
  const val = await redis.hget(`peer:${peerId}`, key);
  return val ? JSON.parse(val) : [];
}

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

io.use(async (socket, next) => {
  const token = socket.handshake.query?.token as string;
  // TODO: Validate token (e.g., check with auth-streaming-server or JWT)
  if (!token) {
    return next(new Error('Authentication required'));
  }
  // For demo, accept any non-empty token
  // In production, verify token with auth server or JWT
  next();
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Expect client to join a room
  socket.on('joinRoom', async ({ roomId }, callback) => {
    await addPeerToRoom(roomId, socket.id);
    callback({ success: true });
  });

  socket.on('getRtpCapabilities', (callback) => {
    callback(router.rtpCapabilities);
  });

  socket.on('getRouterRtpCapabilities', (callback) => {
    callback(router.rtpCapabilities);
  });

  // --- Replace in-memory peer state with Redis ---
  socket.on('createProducerTransport', async (callback) => {
    try {
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        // iceServers: [
        //   { urls: 'stun:stun.l.google.com:19302' },
        //   { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
        // ]
      });
      const transports = await getPeerArray(socket.id, 'transports');
      transports.push(transport.id);
      await setPeerArray(socket.id, 'transports', transports);
      // Store transport object in memory for now (mediasoup objects can't be serialized)
      socket.data = socket.data || {};
      socket.data.transports = socket.data.transports || {};
      socket.data.transports[transport.id] = transport;
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      callback({ error: (error as Error).message });
    }
  });

  socket.on('connectTransport', async ({ dtlsParameters, transportId }, callback) => {
    try {
      const transport = socket.data?.transports?.[transportId];
      if (!transport) throw new Error('No transport found');
      await transport.connect({ dtlsParameters });
      callback();
    } catch (error) {
      callback({ error: (error as Error).message });
    }
  });

  socket.on('produce', async ({ kind, rtpParameters, transportId }, callback) => {
    try {
      const transport = socket.data?.transports?.[transportId];
      if (!transport) throw new Error('No transport found');
      const producer = await transport.produce({ kind, rtpParameters });
      const producers = await getPeerArray(socket.id, 'producers');
      producers.push(producer.id);
      await setPeerArray(socket.id, 'producers', producers);
      socket.data.producers = socket.data.producers || {};
      socket.data.producers[producer.id] = producer;
      // Notify all peers in the room
      const roomId = await getPeerData(socket.id, 'roomId');
      if (!roomId || typeof roomId !== 'string') {
        callback({ error: 'Not in a room' });
        return;
      }
      const peerIds = await getPeersInRoom(roomId);
      peerIds.forEach((pid: string) => {
        if (pid !== socket.id) io.to(pid).emit('newProducer', { producerId: producer.id, kind });
      });
      // Notify cluster
      await notifyNewProducer(roomId, producer.id, kind);
      callback({ id: producer.id });
    } catch (error) {
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
        // iceServers: [ ... ]
      });
      const transports = await getPeerArray(socket.id, 'transports');
      transports.push(transport.id);
      await setPeerArray(socket.id, 'transports', transports);
      socket.data = socket.data || {};
      socket.data.transports = socket.data.transports || {};
      socket.data.transports[transport.id] = transport;
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      callback({ error: (error as Error).message });
    }
  });

  socket.on('connectConsumerTransport', async ({ dtlsParameters, transportId }, callback) => {
    try {
      const transport = socket.data?.transports?.[transportId];
      if (!transport) throw new Error('No transport found');
      await transport.connect({ dtlsParameters });
      callback();
    } catch (error) {
      callback({ error: (error as Error).message });
    }
  });

  socket.on('consume', async ({ kind, rtpCapabilities }, callback) => {
    try {
      const roomId = await getPeerData(socket.id, 'roomId');
      if (!roomId || typeof roomId !== 'string') {
        callback({ error: 'Not in a room' });
        return;
      }
      const peerIds = await getPeersInRoom(roomId);
      let foundProducer = null;
      for (const pid of peerIds) {
        if (pid === socket.id) continue;
        const producers = await getPeerArray(pid, 'producers');
        for (const prodId of producers) {
          const producer = socket.data?.producers?.[prodId];
          if (producer && producer.kind === kind && !producer.closed) {
            foundProducer = producer;
            break;
          }
        }
        if (foundProducer) break;
      }
      if (!foundProducer) {
        callback({ error: 'No producer found' });
        return;
      }
      const transports = await getPeerArray(socket.id, 'transports');
      const transport = socket.data?.transports?.[transports[transports.length - 1]];
      if (!router.canConsume({ producerId: foundProducer.id, rtpCapabilities })) {
        callback({ error: 'Cannot consume' });
        return;
      }
      const consumer = await transport.consume({
        producerId: foundProducer.id,
        rtpCapabilities,
        paused: false,
      });
      const consumers = await getPeerArray(socket.id, 'consumers');
      consumers.push(consumer.id);
      await setPeerArray(socket.id, 'consumers', consumers);
      socket.data.consumers = socket.data.consumers || {};
      socket.data.consumers[consumer.id] = consumer;
      callback({
        id: consumer.id,
        producerId: foundProducer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (error) {
      callback({ error: (error as Error).message });
    }
  });

  socket.on('resumeConsumer', async ({ consumerId }, callback) => {
    try {
      const consumer = socket.data?.consumers?.[consumerId];
      if (consumer) {
        await consumer.resume();
        callback({ success: true });
      } else {
        callback({ error: 'Consumer not found' });
      }
    } catch (error) {
      callback({ error: (error as Error).message });
    }
  });

  // --- Chat Feature ---
  socket.on('chatMessage', async ({ roomId, message, username }) => {
    if (!roomId || !message) return;
    // Broadcast to all peers in the room
    const peerIds = await getPeersInRoom(roomId);
    peerIds.forEach((pid: string) => {
      io.to(pid).emit('chatMessage', { username, message, from: socket.id, roomId });
    });
    // Optionally, store chat history in Redis (not implemented here)
  });

  socket.on('disconnect', async () => {
    const roomId = await getPeerData(socket.id, 'roomId');
    if (roomId) {
      await removePeerFromRoom(roomId, socket.id);
    }
    // Clean up mediasoup objects in memory
    if (socket.data) {
      Object.values(socket.data.transports || {}).forEach((t: any) => t.close());
      Object.values(socket.data.producers || {}).forEach((p: any) => p.close());
      Object.values(socket.data.consumers || {}).forEach((c: any) => c.close());
    }
  });
});

// --- Redis Pub/Sub for SFU Clustering ---
sub.subscribe('mediasoup-events');
sub.on('message', async (channel, message) => {
  if (channel !== 'mediasoup-events') return;
  const event = JSON.parse(message);
  // Example: handle new producer notification from another node
  if (event.type === 'newProducer') {
    const { roomId, producerId, kind } = event;
    const peerIds = await getPeersInRoom(roomId);
    peerIds.forEach((pid: string) => {
      io.to(pid).emit('newProducer', { producerId, kind });
    });
  }
  // Add more event types as needed for distributed coordination
});

// When a new producer is created, publish to all nodes
async function notifyNewProducer(roomId: string, producerId: string, kind: string) {
  await pub.publish('mediasoup-events', JSON.stringify({ type: 'newProducer', roomId, producerId, kind }));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await createRouter();
    server.listen(PORT, () => {
      console.log(`✅ Mediasoup server running on http://localhost:${PORT}`);
      console.log('Waiting for WebSocket connections...');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// TURN/STUN and Simulcast/SVC config (to be used in router.createWebRtcTransport and router.createRouter)
// Example TURN config:
// listenIps: [{ ip: '0.0.0.0', announcedIp: null }]

// Simple file logger
function logToFile(msg: string) {
  const logPath = path.join(__dirname, 'server.log');
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
}

process.on('uncaughtException', (err) => {
  logToFile(`Uncaught Exception: ${err.stack || err}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logToFile(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});