import express from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import session from 'express-session';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
app.use(cors());
app.use(bodyParser.json());
app.use(session({ secret: 'secret123', resave: false, saveUninitialized: true }));
const users = {};
const streamAccess = {};
// Register new user
const registerUser = (req, res) => {
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
const loginUser = (req, res) => {
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
const shareStream = (req, res) => {
    const { streamId, password } = req.body;
    if (!streamAccess[streamId]) {
        res.status(404).send('Stream not found');
        return;
    }
    streamAccess[streamId].password = password || undefined;
    res.send('Link configured');
};
// Validate access
const validateAccess = (req, res) => {
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
server.listen(4000, () => console.log('🔐 Auth streaming server running on http://localhost:4000'));
