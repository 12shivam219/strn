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
import pino from 'pino';

declare module 'express-session' {
  interface SessionData {
    user: { username: string; streamId: string };
  }
}

// DTO classes with validation
class UserDTO {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password: string;
}

class StreamDTO {
  @IsString()
  streamId: string;

  @IsOptional()
  @IsString()
  password?: string;
}

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with enhanced security settings
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8,
  allowEIO3: true,
  allowRequest: (req, callback) => {
    // Add additional request validation
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['*'];
    const origin = req.headers.origin || '';
    
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
});

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    domain: process.env.SESSION_COOKIE_DOMAIN
  },
  store: new MemoryStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  })
}));

interface User {
  username: string;
  hashedPassword: string;
  streamId: string;
  lastAccess: number;
}

interface StreamAccess {
  password?: string;
  owner: string;
  lastAccess: number;
}

const users: Record<string, User> = {};
const streamAccess: Record<string, StreamAccess> = {};

// Cleanup inactive streams
setInterval(() => {
  const now = Date.now();
  Object.keys(streamAccess).forEach(streamId => {
    if (now - streamAccess[streamId].lastAccess > STREAM_CLEANUP_INTERVAL) {
      delete streamAccess[streamId];
      logger.info({ streamId }, 'Stream cleaned up due to inactivity');
    }
  });
}, STREAM_CLEANUP_INTERVAL);

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ eventLoopLagMonitor: false });
const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
});

// Log incoming requests
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip }, 'Incoming request');
  next();
});

// Simple file logger
function logToFile(msg: string) {
  const logPath = path.join(__dirname, 'server.log');
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
}

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
  process.exit(1);
});

// Register new user
const registerUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const userDTO = plainToClass(UserDTO, req.body);
    const errors = await validate(userDTO);
    
    if (errors.length > 0) {
      logger.warn({ errors }, 'Registration failed: validation error');
      res.status(400).json({ errors: errors.map(e => e.constraints) });
      return;
    }

    if (users[userDTO.username]) {
      logger.warn({ username: userDTO.username }, 'Registration failed: username taken');
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const hashedPassword = await bcrypt.hash(userDTO.password, 10);
    const streamId = randomUUID();
    
    users[userDTO.username] = {
      username: userDTO.username,
      hashedPassword,
      streamId,
      lastAccess: Date.now()
    };
    
    streamAccess[streamId] = {
      owner: userDTO.username,
      lastAccess: Date.now()
    };
    
    logger.info({ username: userDTO.username, streamId }, 'User registered');
    res.json({ streamId });
  } catch (error) {
    logger.error({ error }, 'Registration failed');
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Login user
const loginUser: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const userDTO = plainToClass(UserDTO, req.body);
    const errors = await validate(userDTO);
    
    if (errors.length > 0) {
      logger.warn({ errors }, 'Login failed: validation error');
      res.status(400).json({ errors: errors.map(e => e.constraints) });
      return;
    }

    const user = users[userDTO.username];
    if (!user) {
      logger.warn({ username: userDTO.username }, 'Login failed: user not found');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(userDTO.password, user.hashedPassword);
    if (!validPassword) {
      logger.warn({ username: userDTO.username }, 'Login failed: invalid password');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    user.lastAccess = Date.now();
    streamAccess[user.streamId].lastAccess = Date.now();

    req.session.user = { username: user.username, streamId: user.streamId };
    logger.info({ username: user.username }, 'User logged in');
    res.json({ username: user.username, streamId: user.streamId });
  } catch (error) {
    logger.error({ error }, 'Login failed');
    res.status(500).json({ error: 'Internal server error' });
  }
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

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: RequestHandler) => {
  logger.error({ error: err.message }, 'Request error');
  res.status(500).json({ error: 'Internal server error' });
});

// Routes
app.get('/', (req, res) => {
  res.send('🔐 Auth Streaming Server is running!');
});

app.post('/api/register', registerUser);
app.post('/api/login', loginUser);
app.post('/api/stream/share', shareStream);
app.post('/api/stream/validate', validateAccess);

// WebSocket connection handling
io.on('connection', (socket) => {
  socket.on('joinStream', async ({ streamId, password }, ack) => {
    try {
      // Validate session
      if (!socket.handshake.session?.user) {
        ack({ error: 'Authentication required' });
        return;
      }

      const access = streamAccess[streamId];
      if (!access) {
        ack({ error: 'Stream not found' });
        return;
      }

      // Check if user owns the stream or has proper access
      if (access.owner !== socket.handshake.session.user.username && access.password) {
        ack({ error: 'Access denied' });
        return;
      }

      // Validate password if required
      if (access.password && access.password !== password) {
        ack({ error: 'Invalid password' });
        return;
      }

      socket.join(streamId);
      access.lastAccess = Date.now();
      ack({ ok: true });
    } catch (error) {
      logger.error({ error }, 'WebSocket join error');
      ack({ error: 'Internal error' });
    }
  });

  // Handle socket disconnect
  socket.on('disconnect', () => {
    Object.keys(socket.rooms).forEach(room => {
      socket.leave(room);
    });
  });
});

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

// Graceful shutdown
let isShuttingDown = false;

process.on('SIGINT', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Starting graceful shutdown...');

  // Close WebSocket connections
  io.close();

  // Wait for active connections to close
  await delay(5000);

  // Close server
  server.close(() => {
    logger.info('Server shutdown complete');
    process.exit(0);
  });
});

// Start server
const port = parseInt(process.env.PORT || '4000');
server.listen(port, '0.0.0.0', () => {
  logger.info({
    port,
    env: process.env.NODE_ENV,
    mediaServer: process.env.MEDIA_SERVER_URL
  }, 'Auth streaming server running');
});

// Memory cleanup
setInterval(() => {
  const now = Date.now();
  
  // Cleanup inactive sessions
  Object.keys(users).forEach(username => {
    const user = users[username];
    if (now - user.lastAccess > SESSION_TIMEOUT) {
      delete users[username];
      logger.info({ username }, 'User session cleaned up');
    }
  });
}, STREAM_CLEANUP_INTERVAL);