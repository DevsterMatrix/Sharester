/**
 * TransferEngine — chunked file transfer over WebRTC DataChannels.
 *
 * Wire format (ArrayBuffer):
 *   [0..3]   magic  0xF1 0x4E 0x00 0x01
 *   [4..7]   transferId byte length (uint32 LE)
 *   [8..N]   transferId (UTF-8)
 *   [N..N+3] chunkIndex (uint32 LE)
 *   [N+4..]  raw chunk bytes
 */

import { v4 as uuidv4 } from 'uuid';
import type { WebRTCManager } from './webrtc';
import type { FileMetadata, FileTransfer } from '../types';
import { hashFile, bufferToHex } from './hasher';

const MAGIC             = new Uint8Array([0xF1, 0x4E, 0x00, 0x01]);
const DEFAULT_CHUNK     = 64 * 1024;   // 64 KB
const MAX_IN_FLIGHT     = 32;
const RETRY_LIMIT       = 5;
const ACK_TIMEOUT_MS    = 10_000;
const SPEED_WINDOW_MS   = 3_000;

export type TransferUpdateHandler = (patch: Partial<FileTransfer> & { id: string }) => void;

interface SendState {
  file: File;
  metadata: FileMetadata;
  peerId: string;
  paused: boolean;
  cancelled: boolean;
  currentChunk: number;
  inFlight: Map<number, { sentAt: number; retries: number }>;
  speedSamples: { at: number; bytes: number }[];
}

interface ReceiveState {
  metadata: FileMetadata;
  peerId: string;
  // Store as plain Uint8Array copies — NOT views into a shared ArrayBuffer
  chunks: Map<number, Uint8Array>;
  totalReceived: number;
  speedSamples: { at: number; bytes: number }[];
}

export class TransferEngine {
  private sending   = new Map<string, SendState>();
  private receiving = new Map<string, ReceiveState>();
  private rtc: WebRTCManager;
  private onUpdate: TransferUpdateHandler;

  constructor(rtc: WebRTCManager, onUpdate: TransferUpdateHandler) {
    this.rtc = rtc;
    this.onUpdate = onUpdate;

    rtc.onMessage((fromPeerId, event) => {
      if (typeof event.data === 'string') {
        this._handleControl(fromPeerId, event.data);
      } else if (event.data instanceof ArrayBuffer) {
        this._handleChunk(fromPeerId, event.data);
      }
    });
  }

  // ── Public ────────────────────────────────────────────────────────────────

  async sendFile(file: File, peerId: string): Promise<string> {
    const id = uuidv4();

    this.onUpdate({
      id, direction: 'send', peerId, status: 'hashing', progress: 0,
      metadata: { id, name: file.name, size: file.size, type: file.type, sha256: '',
                  totalChunks: 0, chunkSize: DEFAULT_CHUNK, lastModified: file.lastModified },
      file, bytesTransferred: 0, speedBps: 0, etaSeconds: Infinity,
      startedAt: Date.now(), receivedChunks: new Map(), ackedChunks: new Set(), failedChunks: new Set(),
    });

    const sha256 = await hashFile(file, (pct) => {
      this.onUpdate({ id, progress: Math.round(pct * 0.1) });
    });

    const totalChunks = Math.ceil(file.size / DEFAULT_CHUNK);
    const metadata: FileMetadata = {
      id, name: file.name, size: file.size, type: file.type,
      sha256, totalChunks, chunkSize: DEFAULT_CHUNK, lastModified: file.lastModified,
    };

    this.sending.set(id, {
      file, metadata, peerId,
      paused: false, cancelled: false, currentChunk: 0,
      inFlight: new Map(), speedSamples: [],
    });

    this._ctrl(peerId, { type: 'file_offer', transferId: id, payload: metadata });
    this.onUpdate({ id, metadata, status: 'queued', progress: 10 });
    return id;
  }

  acceptTransfer(id: string)  {
    const rx = this.receiving.get(id);
    if (!rx) return;
    this._ctrl(rx.peerId, { type: 'file_accept', transferId: id });
    this.onUpdate({ id, status: 'transferring' });
  }

  rejectTransfer(id: string)  {
    const rx = this.receiving.get(id);
    if (!rx) return;
    this._ctrl(rx.peerId, { type: 'file_reject', transferId: id });
    this.receiving.delete(id);
    this.onUpdate({ id, status: 'cancelled' });
  }

  pauseTransfer(id: string)   {
    const tx = this.sending.get(id);
    if (!tx) return;
    tx.paused = true;
    this._ctrl(tx.peerId, { type: 'pause', transferId: id });
    this.onUpdate({ id, status: 'paused' });
  }

  resumeTransfer(id: string)  {
    const tx = this.sending.get(id);
    if (!tx || !tx.paused) return;
    tx.paused = false;
    this._ctrl(tx.peerId, { type: 'resume', transferId: id });
    this.onUpdate({ id, status: 'transferring' });
    this._pump(id);
  }

  cancelTransfer(id: string)  {
    const tx = this.sending.get(id);
    if (tx) { tx.cancelled = true; this._ctrl(tx.peerId, { type: 'cancel', transferId: id }); this.sending.delete(id); }
    const rx = this.receiving.get(id);
    if (rx) { this._ctrl(rx.peerId, { type: 'cancel', transferId: id }); this.receiving.delete(id); }
    this.onUpdate({ id, status: 'cancelled' });
  }

  // ── Control ────────────────────────────────────────────────────────────────

  private _handleControl(fromPeerId: string, raw: string) {
    let msg: { type: string; transferId: string; payload?: unknown };
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, transferId: id, payload } = msg;

    switch (type) {
      case 'file_offer': {
        const meta = payload as FileMetadata;
        this.receiving.set(id, {
          metadata: meta, peerId: fromPeerId,
          chunks: new Map(), totalReceived: 0, speedSamples: [],
        });
        this.onUpdate({
          id, direction: 'receive', peerId: fromPeerId, metadata: meta,
          status: 'queued', progress: 0, bytesTransferred: 0,
          speedBps: 0, etaSeconds: Infinity, startedAt: Date.now(),
          receivedChunks: new Map(), ackedChunks: new Set(), failedChunks: new Set(),
        });
        break;
      }
      case 'file_accept': {
        const tx = this.sending.get(id);
        if (!tx) return;
        this.onUpdate({ id, status: 'transferring', startedAt: Date.now() });
        this._pump(id);
        break;
      }
      case 'file_reject':
        this.sending.delete(id);
        this.onUpdate({ id, status: 'cancelled' });
        break;

      case 'ack': {
        const tx = this.sending.get(id);
        if (!tx) return;
        const chunkIndex = payload as number;
        tx.inFlight.delete(chunkIndex);

        const bytesDone = Math.min((chunkIndex + 1) * tx.metadata.chunkSize, tx.metadata.size);
        const pct = 10 + Math.round((bytesDone / tx.metadata.size) * 90);
        this._sample(tx.speedSamples, tx.metadata.chunkSize);
        const { speedBps, etaSeconds } = this._speed(tx.speedSamples, tx.metadata.size - bytesDone);
        this.onUpdate({ id, progress: pct, bytesTransferred: bytesDone, speedBps, etaSeconds });

        if (chunkIndex >= tx.metadata.totalChunks - 1 && tx.inFlight.size === 0) {
          this.sending.delete(id);
          this.onUpdate({ id, status: 'complete', progress: 100, completedAt: Date.now() });
        } else {
          this._pump(id);
        }
        break;
      }
      case 'request_retry': {
        const tx = this.sending.get(id);
        if (tx) this._sendChunk(id, tx, payload as number);
        break;
      }
      case 'pause':   this.onUpdate({ id, status: 'paused' }); break;
      case 'resume':  this.onUpdate({ id, status: 'transferring' }); break;
      case 'cancel':
        this.sending.delete(id);
        this.receiving.delete(id);
        this.onUpdate({ id, status: 'cancelled' });
        break;
      case 'transfer_complete':
        this.receiving.delete(id);
        this.onUpdate({ id, status: 'complete', progress: 100, completedAt: Date.now() });
        break;
    }
  }

  // ── Chunk receive ─────────────────────────────────────────────────────────

  private _handleChunk(fromPeerId: string, buffer: ArrayBuffer) {
    const view = new DataView(buffer);

    // Validate magic
    if (view.getUint8(0) !== 0xF1 || view.getUint8(1) !== 0x4E ||
        view.getUint8(2) !== 0x00 || view.getUint8(3) !== 0x01) return;

    const idLen      = view.getUint32(4, true);
    const idBytes    = new Uint8Array(buffer, 8, idLen);
    const transferId = new TextDecoder().decode(idBytes);
    const chunkIndex = view.getUint32(8 + idLen, true);
    const dataOffset = 8 + idLen + 4;
    const dataLen    = buffer.byteLength - dataOffset;

    // ── KEY FIX ──────────────────────────────────────────────────────────────
    // Copy the chunk bytes into a NEW standalone Uint8Array.
    // Do NOT use `new Uint8Array(buffer, offset)` — that creates a view sharing
    // the original buffer. When we later call `.buffer` on it we'd get the full
    // wire frame including magic + header bytes, corrupting the hash.
    const data = new Uint8Array(dataLen);
    data.set(new Uint8Array(buffer, dataOffset, dataLen));
    // ─────────────────────────────────────────────────────────────────────────

    const rx = this.receiving.get(transferId);
    if (!rx) return;

    rx.chunks.set(chunkIndex, data);
    rx.totalReceived += dataLen;

    // ACK
    this._ctrl(fromPeerId, { type: 'ack', transferId, payload: chunkIndex });

    // Speed + progress
    this._sample(rx.speedSamples, dataLen);
    const { speedBps, etaSeconds } = this._speed(rx.speedSamples, rx.metadata.size - rx.totalReceived);
    const pct = Math.round((rx.totalReceived / rx.metadata.size) * 100);
    this.onUpdate({ id: transferId, progress: Math.min(pct, 99), bytesTransferred: rx.totalReceived, speedBps, etaSeconds, status: 'transferring' });

    if (rx.chunks.size >= rx.metadata.totalChunks) {
      this._finalize(transferId, rx);
    }
  }

  // ── Pump send ─────────────────────────────────────────────────────────────

  private async _pump(id: string) {
    const tx = this.sending.get(id);
    if (!tx || tx.paused || tx.cancelled) return;

    while (
      tx.currentChunk < tx.metadata.totalChunks &&
      tx.inFlight.size < MAX_IN_FLIGHT &&
      !tx.paused && !tx.cancelled
    ) {
      if (!this.rtc.canSend(tx.peerId)) {
        await this.rtc.waitForBuffer(tx.peerId);
        if (tx.paused || tx.cancelled) return;
      }
      const idx = tx.currentChunk++;
      await this._sendChunk(id, tx, idx);
    }
  }

  private async _sendChunk(id: string, tx: SendState, chunkIndex: number) {
    const dc = this.rtc.getDataChannel(tx.peerId);
    if (!dc || dc.readyState !== 'open') return;

    const start = chunkIndex * tx.metadata.chunkSize;
    const end   = Math.min(start + tx.metadata.chunkSize, tx.file.size);
    const data  = await tx.file.slice(start, end).arrayBuffer();

    const idBytes  = new TextEncoder().encode(id);
    const total    = 4 + 4 + idBytes.byteLength + 4 + data.byteLength;
    const buf      = new ArrayBuffer(total);
    const out      = new Uint8Array(buf);
    const dv       = new DataView(buf);

    out.set(MAGIC, 0);
    dv.setUint32(4, idBytes.byteLength, true);
    out.set(idBytes, 8);
    dv.setUint32(8 + idBytes.byteLength, chunkIndex, true);
    out.set(new Uint8Array(data), 8 + idBytes.byteLength + 4);

    dc.send(buf);

    const existing = tx.inFlight.get(chunkIndex);
    tx.inFlight.set(chunkIndex, { sentAt: Date.now(), retries: existing ? existing.retries + 1 : 0 });

    setTimeout(() => {
      const still = tx.inFlight.get(chunkIndex);
      if (!still || tx.cancelled) return;
      if (still.retries >= RETRY_LIMIT) {
        this.onUpdate({ id, status: 'failed', error: `Chunk ${chunkIndex} failed after ${RETRY_LIMIT} retries` });
        return;
      }
      this._sendChunk(id, tx, chunkIndex);
    }, ACK_TIMEOUT_MS);
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  private async _finalize(transferId: string, rx: ReceiveState) {
    this.onUpdate({ id: transferId, status: 'verifying', progress: 99 });

    // Check all chunks present
    for (let i = 0; i < rx.metadata.totalChunks; i++) {
      if (!rx.chunks.has(i)) {
        this._ctrl(rx.peerId, { type: 'request_retry', transferId, payload: i });
        return;
      }
    }

    // Assemble: build one contiguous Uint8Array from clean chunk copies
    const total    = rx.metadata.totalChunks;
    const expected = rx.metadata.size;
    let assembled  = new Uint8Array(expected);
    let offset     = 0;

    for (let i = 0; i < total; i++) {
      const chunk = rx.chunks.get(i)!;
      assembled.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // ── Hash the raw bytes — same data the sender hashed ─────────────────
    const hashBuf    = await crypto.subtle.digest('SHA-256', assembled);
    const actualHash = bufferToHex(hashBuf);
    // ─────────────────────────────────────────────────────────────────────

    if (actualHash !== rx.metadata.sha256) {
      this.onUpdate({
        id: transferId, status: 'failed',
        error: `Integrity check failed (SHA-256 mismatch). File may be corrupted in transit.`,
      });
      return;
    }

    // Trigger download
    const blob = new Blob([assembled], { type: rx.metadata.type || 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = rx.metadata.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    this._ctrl(rx.peerId, { type: 'transfer_complete', transferId });
    this.receiving.delete(transferId);
    this.onUpdate({ id: transferId, status: 'complete', progress: 100, completedAt: Date.now() });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _ctrl(peerId: string, msg: Record<string, unknown>) {
    const dc = this.rtc.getDataChannel(peerId);
    if (dc?.readyState === 'open') dc.send(JSON.stringify(msg));
  }

  private _sample(samples: { at: number; bytes: number }[], bytes: number) {
    const now = Date.now();
    samples.push({ at: now, bytes });
    const cutoff = now - SPEED_WINDOW_MS;
    while (samples.length > 0 && samples[0].at < cutoff) samples.shift();
  }

  private _speed(samples: { at: number; bytes: number }[], remaining: number) {
    if (samples.length < 2) return { speedBps: 0, etaSeconds: Infinity };
    const ms    = samples[samples.length - 1].at - samples[0].at;
    if (ms <= 0) return { speedBps: 0, etaSeconds: Infinity };
    const total = samples.reduce((s, x) => s + x.bytes, 0);
    const speedBps   = (total / ms) * 1000;
    const etaSeconds = speedBps > 0 ? remaining / speedBps : Infinity;
    return { speedBps, etaSeconds };
  }
}
