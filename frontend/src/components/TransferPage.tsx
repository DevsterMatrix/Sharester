import { useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LogOut, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStore, selectRoom, selectPeersRecord, selectTransferRec } from '../store/useStore';
import { DropZone } from './DropZone';
import { TransferDashboard } from './TransferDashboard';
import { TextPanel } from './TextPanel';
import { cn } from '../lib/utils';

export function TransferPage() {
  const room        = useStore(selectRoom);
  const peersRec    = useStore(useShallow(selectPeersRecord));
  const transferRec = useStore(useShallow(selectTransferRec));
  const leaveRoom   = useRef(useStore.getState().leaveRoom).current;

  const peers = Object.values(peersRec);

  if (!room) return null;

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/?room=${room!.id}`);
    toast.success('Link copied');
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] fade-up">

      {/* Nav */}
      <nav className="h-12 border-b border-[#161616] flex items-center px-5 gap-4">
        <span className="text-[13px] font-semibold text-white mr-1">ShareDrop</span>

        {/* Room code + copy */}
        <button onClick={copyLink}
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#141414] border border-[#1e1e1e] hover:border-[#2a2a2a] transition-all group">
          <span className="font-mono-code text-sm text-[#7c91e9] tracking-[0.2em]">{room.id}</span>
          <Copy className="w-3 h-3 text-[#333] group-hover:text-[#555] transition-colors" />
        </button>

        {/* Peer dots */}
        <div className="flex items-center gap-1.5">
          {peers.map(p => (
            <span key={p.id}
              title={p.connectionStatus}
              className={cn('w-2 h-2 rounded-full',
                p.connectionStatus === 'connected'  ? 'bg-emerald-500'
                : p.connectionStatus === 'failed'   ? 'bg-red-500'
                : 'bg-yellow-500 animate-pulse'
              )} />
          ))}
        </div>

        <button onClick={leaveRoom}
          className="ml-auto flex items-center gap-1.5 text-[12px] text-[#444] hover:text-[#888] transition-colors">
          <LogOut className="w-3.5 h-3.5" />
          Leave
        </button>
      </nav>

      {/* Two-column layout */}
      <div className="max-w-5xl mx-auto px-5 py-6 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* Left: files */}
        <div className="flex flex-col gap-4">
          <DropZone />
          <TransferDashboard />
        </div>

        {/* Right: chat */}
        <div>
          <TextPanel />
        </div>
      </div>
    </div>
  );
}
