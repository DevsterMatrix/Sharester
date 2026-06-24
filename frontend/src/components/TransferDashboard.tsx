import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, selectTransferRec } from '../store/useStore';
import { TransferCard } from './TransferCard';
import type { FileTransfer } from '../types';

export function TransferDashboard() {
  const rec = useStore(useShallow(selectTransferRec));
  const transfers = useMemo(() => Object.values(rec), [rec]);

  const queued = transfers.filter(t => t.status === 'queued');
  const active = transfers.filter(t => ['transferring','hashing','verifying','paused'].includes(t.status));
  const done   = transfers.filter(t => ['complete','failed','cancelled'].includes(t.status));

  if (transfers.length === 0) {
    return null; // nothing to show — drop zone already has hint text
  }

  return (
    <div className="flex flex-col gap-4">
      {queued.length > 0 && <Group label="Pending"     items={queued} />}
      {active.length > 0 && <Group label="Transferring" items={active} />}
      {done.length   > 0 && <Group label="Done"         items={done} />}
    </div>
  );
}

function Group({ label, items }: { label: string; items: FileTransfer[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[#444] uppercase tracking-widest">{label}</span>
        <span className="text-[10px] bg-[#141414] border border-[#1e1e1e] text-[#444] px-1.5 py-0.5 rounded">{items.length}</span>
      </div>
      {items.map(t => <TransferCard key={t.id} transfer={t} />)}
    </div>
  );
}
