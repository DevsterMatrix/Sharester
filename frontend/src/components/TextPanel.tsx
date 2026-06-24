import { useState, useRef, useEffect } from 'react';
import { useStore, selectMessages } from '../store/useStore';
import { cn } from '../lib/utils';
import type { TextMessage } from '../store/useStore';

function Bubble({ msg }: { msg: TextMessage }) {
  const [copied, setCopied] = useState(false);
  const time = new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  async function copy() {
    await navigator.clipboard.writeText(msg.text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn('flex gap-2', msg.fromSelf ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar dot */}
      <div className={cn('w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold',
        msg.fromSelf ? 'bg-[#1c1c2e] text-[#7c91e9]' : 'bg-[#141414] text-[#555]'
      )}>
        {msg.fromSelf ? 'Y' : 'P'}
      </div>

      <div className={cn('flex flex-col gap-1 max-w-[82%]', msg.fromSelf ? 'items-end' : 'items-start')}>
        <div className={cn(
          'relative group px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed',
          /* key: break-words + pre-wrap preserves formatting and prevents overflow */
          'break-words whitespace-pre-wrap [overflow-wrap:anywhere]',
          msg.fromSelf
            ? 'bg-[#1c1c2e] border border-[#3b5bdb]/25 text-[#c5cfff] rounded-tr-sm'
            : 'bg-[#141414] border border-[#1e1e1e] text-[#d0d0d0] rounded-tl-sm'
        )}>
          {msg.text}

          {/* Copy button for received messages — shows on hover */}
          {!msg.fromSelf && (
            <button onClick={copy}
              className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-[#222] border border-[#2a2a2a] flex items-center justify-center transition-opacity">
              {copied
                ? <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                : <svg className="w-2.5 h-2.5 text-[#666]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              }
            </button>
          )}
        </div>
        <span className="text-[10px] text-[#333] px-1">{time}</span>
      </div>
    </div>
  );
}

export function TextPanel() {
  const messages = useStore(selectMessages);
  const sendText = useRef(useStore.getState().sendText).current;

  const [draft, setDraft]   = useState('');
  const bottomRef           = useRef<HTMLDivElement>(null);
  const areaRef             = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    resize(e.target);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function send() {
    const t = draft.trim();
    if (!t) return;
    sendText(t);
    setDraft('');
    if (areaRef.current) { areaRef.current.style.height = 'auto'; }
  }

  return (
    <div className="flex flex-col border border-[#1a1a1a] rounded-xl overflow-hidden bg-[#0d0d0d]" style={{ height: '500px' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#161616]">
        <span className="text-[12px] font-medium text-[#555]">Chat</span>
        {messages.length > 0 && (
          <button
            onClick={async () => {
              const all = messages.map(m => `${m.fromSelf ? 'You' : 'Peer'}: ${m.text}`).join('\n\n');
              await navigator.clipboard.writeText(all);
            }}
            className="text-[11px] text-[#333] hover:text-[#666] transition-colors">
            copy all
          </button>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-[12px] text-[#2a2a2a] text-center leading-relaxed">
              Send text, paste code, or share links<br />Shift+Enter for new line
            </p>
          </div>
        ) : (
          messages.map(m => <Bubble key={m.id} msg={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input — ChatGPT style: textarea with send button inside */}
      <div className="flex-shrink-0 p-3 border-t border-[#161616]">
        <div className="flex items-end gap-2 bg-[#141414] border border-[#222] focus-within:border-[#2a2a2a] rounded-xl px-3 py-2.5 transition-all">
          <textarea
            ref={areaRef}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKey}
            placeholder="Message…"
            rows={1}
            className="flex-1 bg-transparent text-[13px] text-white placeholder-[#333] resize-none focus:outline-none leading-relaxed"
            style={{ minHeight: '22px', maxHeight: '140px' }}
          />
          <button onClick={send} disabled={!draft.trim()}
            className={cn(
              'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all mb-px',
              draft.trim() ? 'bg-[#3b5bdb] hover:bg-[#3451c7]' : 'bg-[#1a1a1a] cursor-not-allowed'
            )}>
            <svg className={cn('w-3.5 h-3.5', draft.trim() ? 'text-white' : 'text-[#333]')}
              viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/>
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-[#222] mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
