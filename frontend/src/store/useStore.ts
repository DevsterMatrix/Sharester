import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { SignalingClient } from '../lib/signaling';
import { WebRTCManager } from '../lib/webrtc';
import { TransferEngine } from '../lib/transfer';
import type { Peer, FileTransfer, ConnectionStatus } from '../types';
import { generateRoomId, formatBytes } from '../lib/utils';

const SIGNALING_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SIGNALING_URL)
    ? import.meta.env.VITE_SIGNALING_URL
    : 'ws://localhost:8080';

let _signaling: SignalingClient | null = null;
let _rtc: WebRTCManager | null = null;
let _engine: TransferEngine | null = null;
let _initialized = false;

export interface TextMessage {
  id: string;
  fromSelf: boolean;
  text: string;
  sentAt: number;
}

export interface RoomState {
  id: string;
  peerId: string;
  peers: Record<string, Peer>;
}

export interface AppState {
  room: RoomState | null;
  signalingStatus: 'disconnected' | 'connecting' | 'connected';
  transfers: Record<string, FileTransfer>;
  messages: TextMessage[];
  view: 'lobby' | 'transfer';
}

export interface AppActions {
  init: () => void;
  teardown: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  sendFiles: (files: File[], peerId: string) => void;
  sendText: (text: string) => void;
  acceptTransfer: (id: string) => void;
  rejectTransfer: (id: string) => void;
  pauseTransfer: (id: string) => void;
  resumeTransfer: (id: string) => void;
  cancelTransfer: (id: string) => void;
}

export type Store = AppState & AppActions;

// Generate room ID once — immediately, before any network call
const INITIAL_ROOM_ID = (() => {
  const url = new URLSearchParams(window.location.search).get('room');
  return url ? url.toUpperCase() : generateRoomId();
})();

export const useStore = create<Store>((set, get) => ({
  room: null,
  signalingStatus: 'disconnected',
  transfers: {},
  messages: [],
  view: 'lobby',

  init() {
    if (_initialized) return;
    _initialized = true;

    // Put room ID in URL immediately
    const url = new URL(window.location.href);
    if (!url.searchParams.get('room')) {
      url.searchParams.set('room', INITIAL_ROOM_ID);
      window.history.replaceState({}, '', url.toString());
    }

    _signaling = new SignalingClient(SIGNALING_URL);

    _signaling.onStatusChange((status) => {
      set({ signalingStatus: status });
      if (status === 'connected') {
        const urlRoom = new URLSearchParams(window.location.search).get('room');
        if (urlRoom && urlRoom !== INITIAL_ROOM_ID) {
          _signaling!.send({ type: 'join_room', roomId: urlRoom });
        } else {
          _signaling!.send({ type: 'create_room', roomId: INITIAL_ROOM_ID });
        }
      }
    });

    _signaling.onMessage((msg) => {
      switch (msg.type) {
        case 'room_created':
        case 'room_joined': {
          const { peerId: myPeerId, roomId } = msg;
          const u = new URL(window.location.href);
          u.searchParams.set('room', roomId);
          window.history.replaceState({}, '', u.toString());

          if (!_rtc) {
            _rtc = new WebRTCManager(_signaling!, myPeerId);

            _rtc.onPeerStatus((peerId, state) => {
              const status: ConnectionStatus =
                state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting'
                : state === 'failed' ? 'failed' : state === 'disconnected' ? 'disconnected' : 'idle';
              set((s) => {
                if (!s.room) return s;
                const old = s.room.peers[peerId];
                if (old?.connectionStatus === status) return s;
                const peers = { ...s.room.peers, [peerId]: { ...old, id: peerId, connectionStatus: status, dataChannel: null } };
                const anyConnected = Object.values(peers).some(p => p.connectionStatus === 'connected');
                return { room: { ...s.room, peers }, view: anyConnected ? 'transfer' : s.view };
              });
              if (state === 'connected') toast.success('Connected');
              if (state === 'failed') toast.error('Connection failed');
            });

            _rtc.onMessage((_pid, event) => {
              if (typeof event.data !== 'string') return;
              try {
                const parsed = JSON.parse(event.data);
                if (parsed.type === 'text_message' && typeof parsed.text === 'string') {
                  set((s) => ({ messages: [...s.messages, { id: uuidv4(), fromSelf: false, text: parsed.text, sentAt: Date.now() }] }));
                }
              } catch {}
            });

            _engine = new TransferEngine(_rtc, (patch) => {
              set((s) => {
                const id = patch.id!;
                const existing = s.transfers[id];
                if (!existing) {
                  const t: FileTransfer = {
                    id, direction: patch.direction ?? 'send', peerId: patch.peerId ?? '',
                    metadata: patch.metadata ?? { id, name: '', size: 0, type: '', sha256: '', totalChunks: 0, chunkSize: 0, lastModified: 0 },
                    file: patch.file, status: patch.status ?? 'queued', progress: patch.progress ?? 0,
                    bytesTransferred: patch.bytesTransferred ?? 0, receivedChunks: new Map(),
                    ackedChunks: new Set(), failedChunks: new Set(), speedBps: patch.speedBps ?? 0,
                    etaSeconds: patch.etaSeconds ?? Infinity, startedAt: patch.startedAt ?? Date.now(),
                    completedAt: patch.completedAt, error: patch.error,
                  };
                  if (t.direction === 'receive' && t.status === 'queued')
                    toast(`${t.metadata.name} — ${formatBytes(t.metadata.size)}`, { icon: '📥', duration: 6000 });
                  return { transfers: { ...s.transfers, [id]: t } };
                }
                const updated = { ...existing, ...patch };
                if (patch.status === 'complete' && existing.status !== 'complete') toast.success(`${existing.metadata.name}`);
                if (patch.status === 'failed' && existing.status !== 'failed') toast.error(`Failed: ${patch.error ?? 'error'}`);
                return { transfers: { ...s.transfers, [id]: updated } };
              });
            });
          }

          const initialPeers: Record<string, Peer> = {};
          if (msg.type === 'room_joined') {
            for (const pid of msg.existingPeers) {
              initialPeers[pid] = { id: pid, connectionStatus: 'connecting', dataChannel: null };
              _rtc!.connectToPeer(pid).catch(console.error);
            }
          }
          set({ room: { id: roomId, peerId: myPeerId, peers: initialPeers } });
          break;
        }
        case 'peer_joined': {
          const { peerId } = msg;
          set((s) => {
            if (!s.room || s.room.peers[peerId]) return s;
            return { room: { ...s.room, peers: { ...s.room.peers, [peerId]: { id: peerId, connectionStatus: 'connecting', dataChannel: null } } } };
          });
          break;
        }
        case 'peer_left': {
          const { peerId } = msg;
          set((s) => {
            if (!s.room) return s;
            const peers = { ...s.room.peers };
            delete peers[peerId];
            const anyConnected = Object.values(peers).some(p => p.connectionStatus === 'connected');
            return { room: { ...s.room, peers }, view: anyConnected ? 'transfer' : 'lobby' };
          });
          _rtc?.closePeer(peerId);
          toast('Peer left');
          break;
        }
        case 'error': toast.error(msg.message); break;
      }
    });

    _signaling.connect();
  },

  teardown() {
    _rtc?.closeAll(); _signaling?.disconnect();
    _signaling = null; _rtc = null; _engine = null; _initialized = false;
    set({ room: null, signalingStatus: 'disconnected', transfers: {}, messages: [], view: 'lobby' });
  },

  joinRoom(roomId) {
    const id = roomId.toUpperCase().trim();
    const u = new URL(window.location.href);
    u.searchParams.set('room', id);
    window.history.replaceState({}, '', u.toString());
    _signaling?.send({ type: 'join_room', roomId: id });
  },

  leaveRoom() {
    _signaling?.send({ type: 'leave_room' });
    _rtc?.closeAll();
    const newId = generateRoomId();
    const u = new URL(window.location.href);
    u.searchParams.set('room', newId);
    window.history.replaceState({}, '', u.toString());
    if (_signaling) _signaling.send({ type: 'create_room', roomId: newId });
    set({ room: null, view: 'lobby', transfers: {}, messages: [] });
  },

  sendFiles(files, peerId) {
    if (!_engine) { toast.error('Not connected'); return; }
    for (const file of files) _engine.sendFile(file, peerId).catch((e: Error) => toast.error(e.message));
  },

  sendText(text) {
    const { room } = get();
    if (!_rtc || !room) return;
    const peers = Object.values(room.peers).filter(p => p.connectionStatus === 'connected');
    const payload = JSON.stringify({ type: 'text_message', text });
    for (const peer of peers) {
      const dc = _rtc.getDataChannel(peer.id);
      if (dc?.readyState === 'open') dc.send(payload);
    }
    set((s) => ({ messages: [...s.messages, { id: uuidv4(), fromSelf: true, text, sentAt: Date.now() }] }));
  },

  acceptTransfer(id)  { _engine?.acceptTransfer(id); },
  rejectTransfer(id)  { _engine?.rejectTransfer(id); },
  pauseTransfer(id)   { _engine?.pauseTransfer(id); },
  resumeTransfer(id)  { _engine?.resumeTransfer(id); },
  cancelTransfer(id)  { _engine?.cancelTransfer(id); },
}));

export const selectRoom        = (s: Store) => s.room;
export const selectSignalStatus = (s: Store) => s.signalingStatus;
export const selectView        = (s: Store) => s.view;
export const selectMessages    = (s: Store) => s.messages;
export const selectPeersRecord = (s: Store) => s.room?.peers ?? {};
export const selectTransferRec = (s: Store) => s.transfers;
export const ROOM_ID_PREVIEW   = INITIAL_ROOM_ID;
