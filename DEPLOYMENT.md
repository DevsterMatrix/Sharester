# P2P Share – Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Peer A)                    │
│  React UI → WebRTC DataChannel → File Chunks (binary)   │
└─────────────────────┬──────────────────────────────────-┘
                      │ SDP + ICE only (JSON over WS)
                      ▼
┌─────────────────────────────────────────────────────────┐
│             Signaling Server (Node.js / WS)             │
│   Rooms · SDP relay · ICE relay · Health check HTTP     │
└─────────────────────┬───────────────────────────────────┘
                      │ SDP + ICE only
                      ▼
┌─────────────────────────────────────────────────────────┐
│                     Browser (Peer B)                    │
│  React UI → WebRTC DataChannel ← File Chunks (binary)   │
└─────────────────────────────────────────────────────────┘

NO FILE DATA PASSES THROUGH THE SIGNALING SERVER.
End-to-end encrypted by DTLS (built into WebRTC).
```

---

## Project Structure

```
p2p-share/
├── frontend/                   # Vite + React + TypeScript
│   ├── src/
│   │   ├── types/index.ts      # All shared TypeScript types
│   │   ├── lib/
│   │   │   ├── signaling.ts    # WebSocket client (reconnect, queue)
│   │   │   ├── webrtc.ts       # RTCPeerConnection manager
│   │   │   ├── transfer.ts     # Chunked transfer engine
│   │   │   ├── hasher.ts       # SHA-256 streaming hash
│   │   │   └── utils.ts        # Formatting helpers
│   │   ├── store/
│   │   │   └── useStore.ts     # Zustand global state
│   │   ├── hooks/
│   │   │   └── useDropZone.ts  # Drag-and-drop hook
│   │   └── components/
│   │       ├── Header.tsx
│   │       ├── RoomPanel.tsx
│   │       ├── DropZone.tsx
│   │       ├── TransferCard.tsx
│   │       ├── TransferDashboard.tsx
│   │       ├── StatusBadge.tsx
│   │       └── QRCode.tsx
│   └── .env.example
└── signaling-server/
    └── server.js               # WebSocket signaling (ws + uuid)
```

---

## 1. Signaling Server – VPS Deployment

### Requirements
- Node.js 18+ on any Linux VPS (Ubuntu 22.04 recommended)
- A domain or subdomain pointed at the VPS (e.g. `signal.yourdomain.com`)
- Ports 80 and 443 open (for TLS via Caddy/nginx)

### Steps

#### 1.1 Upload & install

```bash
# On your VPS
mkdir -p /opt/p2p-signaling
cd /opt/p2p-signaling

# Copy signaling-server/ contents here, then:
npm install --production
```

#### 1.2 Run as a systemd service

```bash
sudo nano /etc/systemd/system/p2p-signaling.service
```

```ini
[Unit]
Description=P2P Share Signaling Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/p2p-signaling
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=8080
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now p2p-signaling
sudo systemctl status p2p-signaling
```

#### 1.3 TLS with Caddy (recommended)

```bash
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```

```
signal.yourdomain.com {
    reverse_proxy localhost:8080
}
```

```bash
sudo systemctl restart caddy
```

Caddy auto-provisions a Let's Encrypt certificate. Your signaling WebSocket
URL will be: `wss://signal.yourdomain.com`

#### 1.4 Verify

```bash
curl https://signal.yourdomain.com/health
# → {"status":"ok","rooms":0,"peers":0,"uptime":...}
```

---

## 2. Frontend – Vercel Deployment

### 2.1 Set environment variable

In `frontend/.env.local` (local) or Vercel dashboard (production):

```
VITE_SIGNALING_URL=wss://signal.yourdomain.com
```

### 2.2 Deploy via Vercel CLI

```bash
cd frontend
npm install -g vercel
vercel login

# First deploy (follow prompts, set root to frontend/)
vercel

# Production deploy
vercel --prod
```

### 2.3 Deploy via Vercel Dashboard

1. Push the `frontend/` directory to a GitHub repo
2. Import the repo in vercel.com → New Project
3. Set **Root Directory** → `frontend`
4. Add **Environment Variable**: `VITE_SIGNALING_URL` = `wss://signal.yourdomain.com`
5. Click Deploy

### 2.4 vercel.json (optional, for SPA routing)

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 3. TURN Server (for restricted networks)

WebRTC STUN works for most home/office networks, but corporate
firewalls often block peer-to-peer UDP. Add a TURN server for
reliable connectivity in all environments.

### Using Cloudflare TURN (easiest)

1. Enable **Calls** in your Cloudflare dashboard
2. Generate TURN credentials via the API
3. Add to `frontend/src/lib/webrtc.ts` → `ICE_SERVERS`:

```typescript
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: 'turn:turn.cloudflare.com:3478',
    username: 'YOUR_TURN_USERNAME',
    credential: 'YOUR_TURN_CREDENTIAL',
  },
];
```

### Self-hosted TURN with coturn

```bash
sudo apt install -y coturn
sudo nano /etc/turnserver.conf
```

```
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
realm=yourdomain.com
user=p2pshare:YOUR_SECRET
cert=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

---

## 4. Local Development

```bash
# Terminal 1 – signaling server
cd signaling-server
npm start
# → Listening on ws://localhost:8080

# Terminal 2 – frontend
cd frontend
cp .env.example .env.local
# Edit .env.local: VITE_SIGNALING_URL=ws://localhost:8080
npm run dev
# → http://localhost:5173
```

Open two browser tabs, create a room in one, join in the other.

---

## 5. Scalability Considerations

### Signaling Server
- The signaling server is **stateless per room** – all state is in memory
- For horizontal scaling: replace the in-memory `rooms` Map with Redis
- Each WS message is just JSON (< 1KB), so a single Node.js process
  handles 10,000+ simultaneous signaling connections easily
- Use `cluster` module or PM2 with sticky sessions for multi-core

### WebRTC (P2P)
- File data is 100% P2P – the server load does NOT scale with file size
- Each peer pair has independent DataChannels; the server only relays
  ~10 small SDP/ICE messages per connection setup

### Large Files (10 GB+)
- Files are read in 64 KB chunks via `File.slice()` – never fully loaded
- The receiver accumulates chunks and assembles on completion
- For files > 2 GB, the SHA-256 hash step reads the file in 4 MB windows
- Browser memory usage stays bounded to ~2× the chunk buffer size

### Production Checklist
- [ ] TLS on signaling server (`wss://`)
- [ ] TURN server configured for restricted networks
- [ ] Signaling server behind a reverse proxy with rate limiting
- [ ] systemd service with auto-restart
- [ ] Health check endpoint monitored (e.g. UptimeRobot)
- [ ] Room TTL set appropriately (default: 2 hours)
- [ ] CSP headers on frontend (allow `connect-src wss://signal.yourdomain.com`)

---

## 6. Security Notes

- **DTLS encryption**: All WebRTC DataChannel traffic is encrypted by default
- **No server storage**: File bytes never reach the signaling server
- **Room codes**: 8-character hex (uuidv4 derived) = 2^32 combinations
- **SHA-256 verification**: Every received file is hash-verified before download
- **Metadata sanitization**: File name/type are validated before display
- **Room size limit**: Max 10 peers per room (configurable in `server.js`)
