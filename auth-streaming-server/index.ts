import express, { Request, Response, RequestHandler } from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import session from 'express-session';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import client from 'prom-client';
import fs from 'fs';
import path from 'path';

declare module 'express-session' {
  interface SessionData {
    user: { username: string; password: string; streamId: string };
  }
}

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

app.use(cors());
app.use(bodyParser.json());
app.use(session({ secret: 'secret123', resave: false, saveUninitialized: true }));

const users: Record<string, { username: string, password: string, streamId: string }> = {};
const streamAccess: Record<string, { password?: string, owner: string }> = {};

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();
const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
});

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

// Register new user
const registerUser: RequestHandler = (req: Request, res: Response): void => {
  const { username, password } = req.body;
  
  if (users[username]) {
    res.status(409).send('Username already taken');
    return;
  }

  const streamId = randomUUID();
  users[username] = { username, password, streamId };
  streamAccess[streamId] = { owner: username };

  res.json({ streamId });
};

// Login user
const loginUser: RequestHandler = (req: Request, res: Response): void => {
  const { username, password } = req.body;
  const user = users[username];

  if (!user || user.password !== password) {
    res.status(401).send('Invalid credentials');
    return;
  }
  
  req.session.user = user;
  res.json({ username, streamId: user.streamId });
};

// Share stream link with optional password
const shareStream: RequestHandler = (req: Request, res: Response): void => {
  const { streamId, password } = req.body;
  
  if (!streamAccess[streamId]) {
    res.status(404).send('Stream not found');
    return;
  }

  streamAccess[streamId].password = password || undefined;
  res.send('Link configured');
};

// Validate access
const validateAccess: RequestHandler = (req: Request, res: Response): void => {
  const { streamId, password } = req.body;
  const access = streamAccess[streamId];
  
  if (!access) {
    res.status(404).send('Stream not found');
    return;
  }
  
  if (access.password && access.password !== password) {
    res.status(403).send('Invalid password');
    return;
  }

  res.send('Access granted');
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Routes
app.get('/', (req, res) => {
  res.send('🔐 Auth Streaming Server is running!');
});

app.post('/api/register', registerUser);
app.post('/api/login', loginUser);
app.post('/api/stream/share', shareStream);
app.post('/api/stream/validate', validateAccess);

// Viewer joins stream
io.on('connection', (socket) => {
  socket.on('joinStream', ({ streamId, password }, ack) => {
    const access = streamAccess[streamId];
    
    if (!access || (access.password && access.password !== password)) {
      ack({ error: 'Access denied' });
      return;
    }

    socket.join(streamId);
    ack({ ok: true });
  });
});

server.listen(4000, '0.0.0.0', () => console.log('🔐 Auth streaming server running on http://0.0.0.0:4000'));