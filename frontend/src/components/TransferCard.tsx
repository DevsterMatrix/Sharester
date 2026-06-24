import { useRef } from 'react';
import { useStore } from '../store/useStore';
import type { FileTransfer } from '../types';
import { formatBytes, formatSpeed, formatEta, cn } from '../lib/utils';

export function TransferCard({ transfer }: { transfer: FileTransfer }) {
  const pause  = useRef(useStore.getState().pauseTransfer).current;
  const resume = useRef(useStore.getState().resumeTransfer).current;
  const cancel = useRef(useStore.getState().cancelTransfer).current;
  const accept = useRef(useStore.getState().acceptTransfer).current;
  const reject = useRef(useStore.getState().rejectTransfer).current;

  const { id, direction, metadata, status, progress, bytesTransferred, speedBps, etaSeconds, error } = transfer;

  const isDone     = ['complete', 'cancelled', 'failed'].includes(status);
  const isActive   = ['transferring', 'hashing', 'verifying'].includes(status);
  const isIncoming = direction === 'receive' && status === 'queued';

  // File extension badge
  const ext = metadata.name.split('.').pop()?.toUpperCase().slice(0, 4) ?? '—';

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#111] border border-[#1a1a1a]">

      {/* Row 1: icon + name + status */}
      <div className="flex items-center gap-3">
        {/* Ext badge */}
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center text-[9px] font-bold font-mono-code flex-shrink-0',
          direction === 'send' ? 'bg-[#1c1c2e] text-[#7c91e9]' : 'bg-[#0e1f1a] text-[#34d399]'
        )}>
          {ext}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-white truncate font-medium" title={metadata.name}>{metadata.name || '—'}</p>
          <p className="text-[11px] text-[#444]">{formatBytes(metadata.size)}</p>
        </div>

        {/* Status */}
        <span className={cn('text-[11px] font-medium flex-shrink-0',
          status === 'complete'      ? 'text-emerald-500'
          : status === 'failed'      ? 'text-red-400'
          : status === 'paused'      ? 'text-yellow-500'
          : status === 'transferring'? 'text-[#7c91e9]'
          : 'text-[#444]'
        )}>
          {status === 'hashing' ? 'hashing…' : status === 'verifying' ? 'verifying…' : status}
        </span>
      </div>

      {/* Incoming offer */}
      {isIncoming && (
        <div className="flex gap-2 mt-1">
          <button onClick={() => accept(id)}
            className="flex-1 py-2 bg-[#1c1c2e] hover:bg-[#252540] border border-[#3b5bdb]/30 text-[#7c91e9] rounded-lg text-[12px] font-medium transition-all">
            Accept
          </button>
          <button onClick={() => reject(id)}
            className="px-4 py-2 bg-[#141414] hover:bg-[#1a1a1a] border border-[#222] text-[#444] hover:text-[#666] rounded-lg text-[12px] transition-all">
            Decline
          </button>
        </div>
      )}

      {/* Progress bar + speed */}
      {!isDone && status !== 'queued' && (
        <div className="flex flex-col gap-1">
          <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-300',
                status === 'paused' ? 'bg-yellow-500/60' : 'bar-active'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Speed + ETA + bytes — shown on BOTH send and receive */}
          {isActive && (
            <div className="flex justify-between text-[11px] text-[#444]">
              <span>{formatBytes(bytesTransferred)} / {formatBytes(metadata.size)}</span>
              <span className="flex items-center gap-2">
                {speedBps > 0 && <span className="text-[#555]">{formatSpeed(speedBps)}</span>}
                {etaSeconds > 0 && isFinite(etaSeconds) && <span>{formatEta(etaSeconds)}</span>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Complete bar */}
      {status === 'complete' && (
        <div className="h-1 bg-emerald-500/20 rounded-full overflow-hidden">
          <div className="h-full w-full bg-emerald-500 rounded-full" />
        </div>
      )}

      {/* Error */}
      {status === 'failed' && error && (
        <p className="text-[11px] text-red-400 mt-0.5">{error}</p>
      )}

      {/* Controls */}
      {!isDone && !isIncoming && status !== 'queued' && direction === 'send' && (
        <div className="flex gap-1.5 justify-end">
          {status === 'paused' && (
            <button onClick={() => resume(id)}
              className="text-[11px] px-3 py-1 rounded-lg bg-[#141414] border border-[#222] text-[#555] hover:text-white transition-all">
              Resume
            </button>
          )}
          {status === 'transferring' && (
            <button onClick={() => pause(id)}
              className="text-[11px] px-3 py-1 rounded-lg bg-[#141414] border border-[#222] text-[#555] hover:text-white transition-all">
              Pause
            </button>
          )}
          <button onClick={() => cancel(id)}
            className="text-[11px] px-3 py-1 rounded-lg bg-[#141414] border border-[#222] text-[#555] hover:text-red-400 transition-all">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
