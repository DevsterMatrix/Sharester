# P2P Share

Peer-to-peer file sharing via WebRTC DataChannels. Files transfer
**directly between browsers** – no file data touches any server.

## Features

- **True P2P**: raw WebRTC DataChannels, no PeerJS abstraction
- **Large file support**: 10 GB+ via streaming 64 KB chunks
- **SHA-256 integrity**: every file is verified on arrival
- **Pause / Resume / Cancel**: full transfer control
- **Room-based**: join via code, link, or QR code
- **Real-time metrics**: speed (MB/s) and ETA per transfer
- **Backpressure**: respects DataChannel buffer limits
- **Auto-retry**: failed chunks re-sent up to 5 times
- **End-to-end encrypted**: DTLS built into WebRTC

## Quick Start

```bash
# Signaling server
cd signaling-server && npm install && npm start

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment.

## Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 + Vite |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| P2P transport | WebRTC DataChannels (raw) |
| Signaling | Node.js + ws |
| Hashing | Web Crypto API (SHA-256) |
| QR codes | qrcode |
