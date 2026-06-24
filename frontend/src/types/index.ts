// ─── Peer & Room ─────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'disconnected';

export interface Peer {
  id: string;
  connectionStatus: ConnectionStatus;
  dataChannel: RTCDataChannel | null;
}

export interface Room {
  id: string;
  peerId: string;
  peers: Record<string, Peer>;  // plain object for Zustand compatibility
}

// ─── File Transfer ────────────────────────────────────────────────────────────

export type TransferStatus =
  | 'queued'
  | 'hashing'
  | 'transferring'
  | 'paused'
  | 'verifying'
  | 'complete'
  | 'failed'
  | 'cancelled';

export type TransferDirection = 'send' | 'receive';

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  sha256: string;
  totalChunks: number;
  chunkSize: number;
  lastModified: number;
}

export interface FileTransfer {
  id: string;
  direction: TransferDirection;
  peerId: string;
  file?: File;
  metadata: FileMetadata;
  status: TransferStatus;
  progress: number;
  bytesTransferred: number;
  receivedChunks: Map<number, ArrayBuffer>;
  ackedChunks: Set<number>;
  failedChunks: Set<number>;
  speedBps: number;
  etaSeconds: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

// ─── Signaling messages ───────────────────────────────────────────────────────

export interface WsWelcome        { type: 'welcome';         peerId: string }
export interface WsRoomCreated    { type: 'room_created';    roomId: string; peerId: string }
export interface WsRoomJoined     { type: 'room_joined';     roomId: string; peerId: string; existingPeers: string[] }
export interface WsRoomLeft       { type: 'room_left' }
export interface WsPeerJoined     { type: 'peer_joined';     peerId: string; roomId: string; peerCount: number }
export interface WsPeerLeft       { type: 'peer_left';       peerId: string; roomId: string; peerCount: number }
export interface WsOffer          { type: 'offer';           fromId: string; targetId: string; payload: RTCSessionDescriptionInit }
export interface WsAnswer         { type: 'answer';          fromId: string; targetId: string; payload: RTCSessionDescriptionInit }
export interface WsIceCandidate   { type: 'ice_candidate';   fromId: string; targetId: string; payload: RTCIceCandidateInit }
export interface WsError          { type: 'error';           message: string }

export type SignalingMessage =
  | WsWelcome | WsRoomCreated | WsRoomJoined | WsRoomLeft
  | WsPeerJoined | WsPeerLeft
  | WsOffer | WsAnswer | WsIceCandidate
  | WsError;
