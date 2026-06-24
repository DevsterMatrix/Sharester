import { useState, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore, selectSignalStatus, selectPeersRecord, ROOM_ID_PREVIEW } from '../store/useStore';
import { QRCode } from './QRCode';
import { cn } from '../lib/utils';

export function LobbyPage() {
  const sigStatus = useStore(selectSignalStatus);
  const peersRec  = useStore(useShallow(selectPeersRecord));
  const joinRoom  = useRef(useStore.getState().joinRoom).current;

  const peers = Object.values(peersRec);
  const isConnecting = peers.some(p => p.connectionStatus === 'connecting');

  const [code,   setCode]   = useState('');
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const roomUrl = `${window.location.origin}/?room=${ROOM_ID_PREVIEW}`;

  async function copy() {
    await navigator.clipboard.writeText(roomUrl);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  function join() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return;
    joinRoom(c); setCode('');
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-[360px] fade-up">

        {/* Wordmark */}
        <div className="mb-10 text-center">
          <h1 className="text-xl font-semibold text-white tracking-tight">Sharester</h1>
          <p className="text-[13px] text-[#555] mt-1">peer-to-peer · end-to-end encrypted</p>
        </div>

        {/* Room code block */}
        <div className="mb-1">
          <p className="text-[11px] text-[#444] uppercase tracking-widest mb-2">Your room code</p>
          <div className="flex items-center justify-between bg-[#141414] border border-[#222] rounded-xl px-5 py-4">
            <span className="font-mono-code text-4xl font-bold text-white tracking-[0.3em]">
              {ROOM_ID_PREVIEW}
            </span>
            <div className="flex items-center gap-1">
              {/* Connectivity dot */}
              <span className={cn(
                'w-1.5 h-1.5 rounded-full mr-2',
                sigStatus === 'connected' ? 'bg-emerald-500' : 'bg-[#333] animate-pulse'
              )} />
            </div>
          </div>
        </div>

        {/* Share row */}
        <div className="flex gap-2 mb-7">
          <button onClick={copy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] border border-[#222] hover:border-[#333] text-[13px] text-[#888] hover:text-white transition-all">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button onClick={() => setShowQR(v => !v)}
            className={cn(
              'px-4 py-2.5 rounded-xl border text-[13px] transition-all',
              showQR ? 'bg-[#1c1c2e] border-[#3b5bdb]/40 text-[#7c91e9]' : 'bg-[#141414] border-[#222] text-[#555] hover:text-[#888]'
            )}>
            QR
          </button>
        </div>

        {showQR && (
          <div className="flex justify-center mb-6 p-5 bg-[#141414] border border-[#1e1e1e] rounded-xl">
            <QRCode value={roomUrl} size={140} />
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-[#1e1e1e]" />
          <span className="text-[11px] text-[#333]">or join a room</span>
          <div className="flex-1 h-px bg-[#1e1e1e]" />
        </div>

        {/* Join input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && join()}
            placeholder="XXXX"
            maxLength={4}
            className="flex-1 bg-[#141414] border border-[#222] focus:border-[#3b5bdb]/50 rounded-xl px-4 py-3 text-white placeholder-[#333] font-mono-code text-2xl tracking-[0.3em] focus:outline-none transition-all text-center"
          />
          <button onClick={join} disabled={code.length < 4}
            className={cn(
              'px-5 rounded-xl text-[13px] font-medium transition-all',
              code.length >= 4
                ? 'bg-[#3b5bdb] hover:bg-[#3451c7] text-white'
                : 'bg-[#141414] text-[#333] cursor-not-allowed border border-[#1e1e1e]'
            )}>
            Join
          </button>
        </div>

        {/* Status line */}
        <div className="mt-5 h-5 flex items-center justify-center">
          {isConnecting && (
            <p className="text-[12px] text-[#555] animate-pulse">Establishing connection…</p>
          )}
        </div>

      </div>
    </div>
  );
}
