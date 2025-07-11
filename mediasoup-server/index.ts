import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mediasoup from 'mediasoup';
import cors from 'cors';
import client from 'prom-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();
const server = http.createServer(app);

// Get origins from environment variables
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  "https://client.victoriouswater-bf2045fa.centralindia.azurecontainerapps.io",
  "https://strn-rbdx.onrender.com"
];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxHttpBufferSize: 1e8
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
  cookie: false
});

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ eventLoopLagMonitor: false });
const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
});

// MediaSoup settings
const mediasoupSettings = {
  numWorkers: process.env.MEDIASOUP_WORKERS || 2,
  maxBitrate: process.env.MEDIASOUP_MAX_BITRATE || 10000000,
  initialBitrate: process.env.MEDIASOUP_INITIAL_BITRATE || 1000000,
  minBitrate: process.env.MEDIASOUP_MIN_BITRATE || 100000
};

// Workers pool
const mediasoupWorkers: mediasoup.Worker[] = [];
let router: mediasoup.Router | null = null;

// --- REMOVE REDIS ---
// In-memory room and peer state
const rooms: Record<string, Set<string>> = {};
const peers: Record<string, any> = {};

// Helper functions for in-memory state
async function addPeerToRoom(roomId: string, peerId: string) {
  if (!rooms[roomId]) rooms[roomId] = new Set();
  rooms[roomId].add(peerId);
  peers[peerId] = peers[peerId] || {};
  peers[peerId].roomId = roomId;
}
async function removePeerFromRoom(roomId: string, peerId: string) {
  if (rooms[roomId]) rooms[roomId].delete(peerId);
  delete peers[peerId];
}
async function getPeersInRoom(roomId: string) {
  return rooms[roomId] ? Array.from(rooms[roomId]) : [];
}
async function setPeerData(peerId: string, key: string, value: string) {
  peers[peerId] = peers[peerId] || {};
  peers[peerId][key] = value;
}
async function getPeerData(peerId: string, key: string) {
  return peers[peerId]?.[key];
}
async function setPeerArray(peerId: string, key: string, arr: any[]) {
  peers[peerId] = peers[peerId] || {};
  peers[peerId][key] = arr;
}
async function getPeerArray(peerId: string, key: string) {
  return peers[peerId]?.[key] || [];
}

async function createWorker() {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });

  worker.on('died', () => {
    logger.error('Mediasoup worker died. Exiting...');
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
  logger.info('Client connected:', socket.id);

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
      const roomId = await getPeerData(socket.id, 'roomId');
      if (!roomId) {
        logger.error(`Socket ${socket.id} tried to create transport without joining a room.`);
        callback({ error: 'Not in a room. Please join a room first.' });
        return;
      }

      // Get TURN credentials
      const credentials = currentTurnCredentials || await getTurnCredentials();

      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        // Use TURN servers if configured
        iceServers: TURN_CONFIG.azure.enabled
          ? [
              {
                urls: TURN_CONFIG.azure.servers,
                username: credentials.username,
                credential: credentials.password
              }
            ]
          : TURN_CONFIG.custom.enabled
          ? [
              {
                urls: TURN_CONFIG.custom.servers,
                username: credentials.username,
                credential: credentials.password
              }
            ]
          : [],
        // Use free STUN servers as fallback
        iceTransportPolicy: TURN_CONFIG.azure.enabled || TURN_CONFIG.custom.enabled ? 'relay' : 'all'
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
      logger.error('Error in createProducerTransport:', error);
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
// REMOVE Redis pub/sub code

// When a new producer is created, publish to all nodes
async function notifyNewProducer(roomId: string, producerId: string, kind: string) {
  // REMOVE Redis publish code
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
      logger.info(`Mediasoup server running on http://localhost:${PORT}`);
      logger.info('Waiting for WebSocket connections...');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

import { TURN_CONFIG, getTurnCredentials } from './turn-config';

// Initialize TURN/STUN configuration
let currentTurnCredentials: { username: string; password: string; ttl: number } | null = null;

// Function to refresh TURN credentials periodically
async function refreshTurnCredentials() {
  try {
    currentTurnCredentials = await getTurnCredentials();
    console.log('TURN credentials refreshed');
    // Schedule next refresh before credentials expire
    setTimeout(refreshTurnCredentials, (currentTurnCredentials?.ttl || 86400) * 1000);
  } catch (error) {
    console.error('Failed to refresh TURN credentials:', error);
    // Retry in 5 minutes
    setTimeout(refreshTurnCredentials, 5 * 60 * 1000);
  }
}

// Start credential refresh
refreshTurnCredentials();

// Simulcast/SVC settings
const simulcastSettings = {
  encodings: [
    { rid: 'r0', maxBitrate: 100000 },
    { rid: 'r1', maxBitrate: 300000 },
    { rid: 'r2', maxBitrate: 900000 }
  ],
  scalabilityMode: 'L1T3'
};

// Simple file logger
function logToFile(msg: string) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
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