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

## Requirements

- Node.js 18+
- FFmpeg (for virtual device output)
- Virtual audio/video devices (VB-Cable, OBS Virtual Camera)

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

## License

MIT