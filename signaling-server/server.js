/**
 * P2P Share – Signaling Server
 * Accepts client-proposed room IDs so the UI can show the room code
 * instantly without waiting for a server roundtrip.
 */
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const http = require('http');

const PORT = process.env.PORT || 8080;
const MAX_ROOM_SIZE = 10;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

const rooms = new Map();      // roomId → { peers: Map<peerId,ws>, createdAt }
const peerToRoom = new Map(); // peerId → roomId

function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }));
}
function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}
function broadcastToRoom(roomId, data, excludeId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [pid, ws] of room.peers) {
    if (pid !== excludeId) send(ws, data);
  }
}
function removePeer(peerId) {
  const roomId = peerToRoom.get(peerId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  room.peers.delete(peerId);
  peerToRoom.delete(peerId);
  broadcastToRoom(roomId, { type: 'peer_left', peerId, roomId, peerCount: room.peers.size });
  if (room.peers.size === 0) rooms.delete(roomId);
}

// TTL cleanup
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      for (const [pid, ws] of room.peers) { send(ws, { type: 'error', message: 'Room expired' }); ws.terminate(); peerToRoom.delete(pid); }
      rooms.delete(roomId);
    }
  }
}, 10 * 60 * 1000);

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, peers: peerToRoom.size, uptime: process.uptime() }));
  } else { res.writeHead(404); res.end(); }
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const peerId = uuidv4();
  ws.peerId = peerId;
  ws.isAlive = true;
  send(ws, { type: 'welcome', peerId });

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { send(ws, { type: 'error', message: 'Invalid JSON' }); return; }
    const { type, roomId, targetId, payload } = msg;

    switch (type) {
      case 'create_room': {
        // Accept client-proposed roomId OR generate one server-side
        const id = (roomId && /^[A-Z0-9]{4,12}$/.test(roomId))
          ? roomId
          : uuidv4().replace(/-/g,'').slice(0,8).toUpperCase();

        if (peerToRoom.has(peerId)) removePeer(peerId);

        if (!rooms.has(id)) {
          rooms.set(id, { peers: new Map(), createdAt: Date.now() });
        }
        const room = rooms.get(id);
        if (room.peers.size >= MAX_ROOM_SIZE) { send(ws, { type: 'error', message: 'Room full' }); return; }

        room.peers.set(peerId, ws);
        peerToRoom.set(peerId, id);
        send(ws, { type: 'room_created', roomId: id, peerId });
        break;
      }
      case 'join_room': {
        if (!roomId) { send(ws, { type: 'error', message: 'roomId required' }); return; }
        const id = roomId.toUpperCase();
        const room = rooms.get(id);
        if (!room) { send(ws, { type: 'error', message: 'Room not found' }); return; }
        if (room.peers.size >= MAX_ROOM_SIZE) { send(ws, { type: 'error', message: 'Room full' }); return; }
        if (peerToRoom.has(peerId)) removePeer(peerId);

        room.peers.set(peerId, ws);
        peerToRoom.set(peerId, id);
        const existingPeers = [...room.peers.keys()].filter(p => p !== peerId);
        send(ws, { type: 'room_joined', roomId: id, peerId, existingPeers });
        broadcastToRoom(id, { type: 'peer_joined', peerId, roomId: id, peerCount: room.peers.size }, peerId);
        break;
      }
      case 'leave_room': removePeer(peerId); send(ws, { type: 'room_left' }); break;
      case 'offer': case 'answer': case 'ice_candidate': {
        if (!targetId) { send(ws, { type: 'error', message: 'targetId required' }); return; }
        const curRoom = peerToRoom.get(peerId);
        if (!curRoom) { send(ws, { type: 'error', message: 'Not in a room' }); return; }
        const targetWs = rooms.get(curRoom)?.peers.get(targetId);
        if (!targetWs) { send(ws, { type: 'error', message: 'Target not found' }); return; }
        send(targetWs, { type, fromId: peerId, targetId, payload });
        break;
      }
      default: send(ws, { type: 'error', message: `Unknown: ${type}` });
    }
  });

  ws.on('close', () => removePeer(peerId));
  ws.on('error', (e) => log('error', 'ws_error', { peerId, error: e.message }));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { removePeer(ws.peerId); ws.terminate(); return; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

httpServer.listen(PORT, () => log('info', 'server_started', { port: PORT }));
