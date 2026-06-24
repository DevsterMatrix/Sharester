/**
 * SignalingClient
 *
 * Manages the WebSocket connection to the signaling server.
 * Provides a typed event-emitter API on top of raw WebSockets.
 * Handles reconnection with exponential back-off.
 */

import type { SignalingMessage } from '../types';

type MessageHandler = (msg: SignalingMessage) => void;
type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected') => void;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_FACTOR = 1.5;

export class SignalingClient {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private pendingMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.intentionallyClosed = false;
    this._connect();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this._clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
  }

  send(data: Record<string, unknown>): void {
    const json = JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(json);
    } else {
      // Queue messages sent before connection is ready
      this.pendingMessages.push(json);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => { this.statusHandlers = this.statusHandlers.filter(h => h !== handler); };
  }

  private _connect(): void {
    this._emitStatus('connecting');
    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
    } catch (err) {
      console.error('[Signaling] Failed to create WebSocket:', err);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this._emitStatus('connected');
      // Flush pending messages
      for (const msg of this.pendingMessages) {
        this.ws?.send(msg);
      }
      this.pendingMessages = [];
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as SignalingMessage;
        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch {
        console.error('[Signaling] Failed to parse message');
      }
    };

    this.ws.onclose = () => {
      this._emitStatus('disconnected');
      if (!this.intentionallyClosed) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error('[Signaling] WebSocket error:', err);
    };
  }

  private _scheduleReconnect(): void {
    this._clearReconnectTimer();
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_FACTOR, this.reconnectAttempt),
      RECONNECT_MAX_MS
    );
    this.reconnectAttempt++;
    console.info(`[Signaling] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _emitStatus(status: 'connecting' | 'connected' | 'disconnected'): void {
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
}
