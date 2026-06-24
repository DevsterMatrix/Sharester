/**
 * WebRTCManager
 *
 * Manages RTCPeerConnection instances for each remote peer.
 * Uses a single DataChannel per peer for all file transfers.
 *
 * DataChannel config is tuned for maximum throughput:
 *   - ordered: false  → no head-of-line blocking, faster for large files
 *   - maxRetransmits: 3 → limited retransmission to avoid stalls
 *
 * Backpressure is implemented by monitoring bufferedAmount and pausing
 * sends when the buffer exceeds a high-water mark.
 */

import type { SignalingClient } from './signaling';

export type DataChannelMessageHandler = (
  fromPeerId: string,
  event: MessageEvent
) => void;

export type PeerStatusHandler = (
  peerId: string,
  status: RTCPeerConnectionState
) => void;

// ICE server config – STUN only for privacy, add TURN for production
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// DataChannel buffer thresholds (bytes)
export const DC_HIGH_WATER = 4 * 1024 * 1024;   // 4 MB – pause sending
export const DC_LOW_WATER  = 1 * 1024 * 1024;   // 1 MB – resume sending

// DataChannel max chunk size for binary messages
export const DC_CHUNK_SIZE = 64 * 1024;          // 64 KB

interface PeerEntry {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;          // "perfect negotiation" polite peer
}

export class WebRTCManager {
  private peers = new Map<string, PeerEntry>();
  private messageHandlers: DataChannelMessageHandler[] = [];
  private statusHandlers: PeerStatusHandler[] = [];
  private signaling: SignalingClient;
  private myPeerId: string;

  constructor(signaling: SignalingClient, myPeerId: string) {
    this.signaling = signaling;
    this.myPeerId = myPeerId;

    signaling.onMessage((msg) => {
      if (msg.type === 'offer')         this._handleOffer(msg.fromId, msg.payload);
      if (msg.type === 'answer')        this._handleAnswer(msg.fromId, msg.payload);
      if (msg.type === 'ice_candidate') this._handleIceCandidate(msg.fromId, msg.payload);
    });
  }

  /** Initiate a connection to a remote peer (caller side) */
  async connectToPeer(remotePeerId: string): Promise<void> {
    const entry = this._getOrCreatePeer(remotePeerId, false /* impolite = initiator */);
    const { pc } = entry;

    // Create DataChannel on the initiator side
    const dc = pc.createDataChannel('file-transfer', {
      ordered: false,
      maxRetransmits: 3,
    });
    this._setupDataChannel(remotePeerId, dc);
    entry.dc = dc;

    try {
      entry.makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.send({
        type: 'offer',
        targetId: remotePeerId,
        payload: pc.localDescription,
      });
    } finally {
      entry.makingOffer = false;
    }
  }

  /** Send binary data to a specific peer via its DataChannel */
  getDataChannel(peerId: string): RTCDataChannel | null {
    return this.peers.get(peerId)?.dc ?? null;
  }

  /** Check if the DataChannel buffer has room */
  canSend(peerId: string): boolean {
    const dc = this.getDataChannel(peerId);
    return dc !== null
      && dc.readyState === 'open'
      && dc.bufferedAmount < DC_HIGH_WATER;
  }

  /** Return a Promise that resolves when bufferedAmount drops below low-water mark */
  waitForBuffer(peerId: string): Promise<void> {
    return new Promise((resolve) => {
      const dc = this.getDataChannel(peerId);
      if (!dc || dc.bufferedAmount < DC_LOW_WATER) {
        resolve();
        return;
      }
      dc.bufferedAmountLowThreshold = DC_LOW_WATER;
      const handler = () => {
        dc.removeEventListener('bufferedamountlow', handler);
        resolve();
      };
      dc.addEventListener('bufferedamountlow', handler);
    });
  }

  /** Close connection to a specific peer */
  closePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.dc?.close();
    entry.pc.close();
    this.peers.delete(peerId);
  }

  /** Close all peer connections */
  closeAll(): void {
    for (const peerId of this.peers.keys()) {
      this.closePeer(peerId);
    }
  }

  onMessage(handler: DataChannelMessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => { this.messageHandlers = this.messageHandlers.filter(h => h !== handler); };
  }

  onPeerStatus(handler: PeerStatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => { this.statusHandlers = this.statusHandlers.filter(h => h !== handler); };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _getOrCreatePeer(peerId: string, polite: boolean): PeerEntry {
    if (this.peers.has(peerId)) return this.peers.get(peerId)!;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const entry: PeerEntry = {
      pc,
      dc: null,
      makingOffer: false,
      ignoreOffer: false,
      polite,
    };
    this.peers.set(peerId, entry);

    // ICE candidate relay
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.signaling.send({
          type: 'ice_candidate',
          targetId: peerId,
          payload: candidate.toJSON(),
        });
      }
    };

    // DataChannel from remote (answerer side)
    pc.ondatachannel = ({ channel }) => {
      this._setupDataChannel(peerId, channel);
      entry.dc = channel;
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      for (const h of this.statusHandlers) {
        h(peerId, pc.connectionState);
      }
      if (pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Connection to ${peerId} failed, attempting restart`);
        pc.restartIce();
      }
    };

    // Negotiation needed (for perfect negotiation)
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        this.signaling.send({
          type: 'offer',
          targetId: peerId,
          payload: pc.localDescription,
        });
      } catch (err) {
        console.error('[WebRTC] onnegotiationneeded error:', err);
      } finally {
        entry.makingOffer = false;
      }
    };

    return entry;
  }

  private _setupDataChannel(peerId: string, dc: RTCDataChannel): void {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = DC_LOW_WATER;

    dc.onopen = () => {
      console.info(`[WebRTC] DataChannel open with ${peerId}`);
    };

    dc.onclose = () => {
      console.info(`[WebRTC] DataChannel closed with ${peerId}`);
    };

    dc.onerror = (err) => {
      console.error(`[WebRTC] DataChannel error with ${peerId}:`, err);
    };

    dc.onmessage = (event) => {
      for (const h of this.messageHandlers) {
        h(peerId, event);
      }
    };
  }

  private async _handleOffer(fromId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const entry = this._getOrCreatePeer(fromId, true /* polite = answerer */);
    const { pc } = entry;

    const offerCollision =
      offer.type === 'offer' &&
      (entry.makingOffer || pc.signalingState !== 'stable');

    entry.ignoreOffer = !entry.polite && offerCollision;
    if (entry.ignoreOffer) return;

    await pc.setRemoteDescription(offer);

    if (offer.type === 'offer') {
      await pc.setLocalDescription();
      this.signaling.send({
        type: 'answer',
        targetId: fromId,
        payload: pc.localDescription,
      });
    }
  }

  private async _handleAnswer(fromId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(fromId);
    if (!entry) return;
    if (entry.pc.signalingState === 'stable') return;
    await entry.pc.setRemoteDescription(answer);
  }

  private async _handleIceCandidate(
    fromId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const entry = this.peers.get(fromId);
    if (!entry || entry.ignoreOffer) return;
    try {
      await entry.pc.addIceCandidate(candidate);
    } catch (err) {
      if (!entry.ignoreOffer) console.error('[WebRTC] addIceCandidate failed:', err);
    }
  }
}
