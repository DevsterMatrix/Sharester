import { useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDropZone } from '../hooks/useDropZone';
import { useStore, selectPeersRecord } from '../store/useStore';
import { cn } from '../lib/utils';

export function DropZone() {
  const peersRec  = useStore(useShallow(selectPeersRecord));
  const sendFiles = useRef(useStore.getState().sendFiles).current;
  const inputRef  = useRef<HTMLInputElement>(null);

  const connected = Object.values(peersRec).filter(p => p.connectionStatus === 'connected');
  const disabled  = connected.length === 0;

  const handleFiles = useCallback((files: File[]) => {
    if (disabled) return;
    sendFiles(files, connected[0].id);
  }, [disabled, connected, sendFiles]);

  const { isDragging, onDragOver, onDragLeave, onDrop } = useDropZone({ onFiles: handleFiles, disabled });

  return (
    <div
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 cursor-pointer transition-all select-none',
        disabled
          ? 'border-[#1a1a1a] cursor-not-allowed'
          : isDragging
            ? 'border-[#3b5bdb]/70 bg-[#3b5bdb]/5 drop-active'
            : 'border-[#222] hover:border-[#333]'
      )}
    >
      <input ref={inputRef} type="file" multiple className="sr-only"
        onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) handleFiles(f); e.target.value = ''; }} />

      {/* Upload icon — just an SVG, no library */}
      <svg className={cn('w-8 h-8', disabled ? 'text-[#222]' : isDragging ? 'text-[#3b5bdb]' : 'text-[#333]')}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>

      <div className="text-center">
        {disabled ? (
          <p className="text-[13px] text-[#333]">Waiting for peer…</p>
        ) : isDragging ? (
          <p className="text-[13px] text-[#7c91e9] font-medium">Drop to send</p>
        ) : (
          <>
            <p className="text-[13px] text-[#666]">Drop files or <span className="text-[#7c91e9]">browse</span></p>
            <p className="text-[11px] text-[#333] mt-1">Any type, any size</p>
          </>
        )}
      </div>
    </div>
  );
}
