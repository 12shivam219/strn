# CrossStream

A cross-platform streaming application built with Electron, React, and MediaSoup for real-time audio/video streaming.

## Architecture

- **auth-streaming-server**: Authentication and session management server
- **mediasoup-server**: SFU (Selective Forwarding Unit) server for WebRTC streaming
- **client**: Electron + React desktop application
- **sender**: Media capture and streaming sender
- **receiver**: Stream receiver with virtual device output
- **tray-app**: System tray application for background streaming

## Quick Start

1. **Install all dependencies:**

   ```bash
   npm run install:all
   ```

2. **Start all servers and client:**
   ```bash
   npm run dev
   ```

This will start:

- Auth server on http://localhost:4000
- MediaSoup server on http://localhost:3000
- Client application on http://localhost:5173

## Individual Components

### Auth Streaming Server (Port 4000)

```bash
cd auth-streaming-server
npm start
```

### MediaSoup Server (Port 3000)

```bash
cd mediasoup-server
npm start
```

### Client Application

```bash
cd client
npm run dev
```

### Sender (Standalone)

```bash
cd sender
npm start
```

### Receiver (Standalone)

```bash
cd receiver
npm start
```

## Features

- ✅ Real-time audio/video streaming
- ✅ Cross-platform desktop application
- ✅ Authentication and session management
- ✅ SFU-based WebRTC streaming
- ✅ Virtual device output support
- ✅ System tray integration
- Multi-party audio/video rooms (mediasoup SFU)
- Real-time chat and screen sharing
- Secure authentication and room access
- Redis-based distributed state for clustering
- TURN/STUN support for NAT traversal
- Health checks and Prometheus metrics for monitoring
- Ready for Docker/PM2 and horizontal scaling

## Requirements

- Node.js 18+
- FFmpeg (for virtual device output)
- Virtual audio/video devices (VB-Cable, OBS Virtual Camera)
- Redis server (for state and pub/sub)
- TURN server (e.g., coturn) for NAT/firewall traversal
- (Optional) Docker and PM2 for process management

## Development

The application uses:

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Express + Socket.IO + MediaSoup
- **Desktop**: Electron
- **Streaming**: WebRTC + MediaSoup

## Troubleshooting

1. **Port conflicts**: Make sure ports 3000 and 4000 are available
2. **MediaSoup issues**: Check that your system supports the required codecs
3. **Virtual devices**: Ensure virtual audio/video devices are properly installed
4. **Permissions**: Grant camera/microphone permissions when prompted

## Deployment & Scaling

### 1. Prerequisites

- Node.js 18+
- Redis server (for state and pub/sub)
- TURN server (e.g., coturn) for NAT/firewall traversal
- (Optional) Docker and PM2 for process management

### 2. Running Locally

- Start Redis server
- Start mediasoup server:
  ```sh
  cd mediasoup-server
  npm install
  npm start
  ```
- Start auth streaming server:
  ```sh
  cd auth-streaming-server
  npm install
  npm start
  ```
- Start client:
  ```sh
  cd client
  npm install
  npm run dev
  ```

### 3. Production/Scaling

- Deploy multiple mediasoup-server instances behind a load balancer
- Use Redis for distributed room/peer state and pub/sub
- Use Docker Compose or Kubernetes for orchestration
- Use PM2 or Docker health checks for auto-restart
- Expose `/health` and `/metrics` endpoints for monitoring (Prometheus, Grafana)
- Secure all endpoints with HTTPS/WSS and strong authentication

### 4. TURN/STUN

- Deploy coturn or similar TURN server
- Update mediasoup server config with your TURN/STUN credentials

### 5. Monitoring

- Scrape `/metrics` endpoints with Prometheus
- Visualize with Grafana dashboards

### 6. Security

- Use strong secrets for session/auth
- Enforce HTTPS/WSS everywhere
- Validate all tokens and user input

## Extending

- Add recording or live streaming (see mediasoup docs)
- Add more advanced chat or file sharing
- Integrate with external auth providers (OAuth, SSO)

---

For more, see the code comments and TODOs in each service.

## License

MIT
