import type { ConnectionStatus } from '../types';
import { cn } from '../lib/utils';

const DOT: Record<ConnectionStatus, string> = {
  idle:         'bg-[#2a2a2a]',
  connecting:   'bg-yellow-500 animate-pulse',
  connected:    'bg-emerald-500',
  reconnecting: 'bg-orange-400 animate-pulse',
  failed:       'bg-red-500',
  disconnected: 'bg-[#2a2a2a]',
};
const LABEL: Record<ConnectionStatus, string> = {
  idle: 'idle', connecting: 'connecting', connected: 'connected',
  reconnecting: 'reconnecting', failed: 'failed', disconnected: 'offline',
};

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-1.5 h-1.5 rounded-full', DOT[status])} />
      <span className="text-[11px] text-[#555]">{LABEL[status]}</span>
    </span>
  );
}
