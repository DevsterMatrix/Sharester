export function formatBytes(bytes: number, d = 1): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(d)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(d)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
export function formatSpeed(bps: number): string { return `${formatBytes(bps)}/s`; }
export function formatEta(s: number): string {
  if (!isFinite(s) || s <= 0) return '';
  if (s < 60) return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
export function cn(...c: (string | boolean | undefined | null)[]): string {
  return c.filter(Boolean).join(' ');
}
// 4-char room ID — 32^4 = 1M combinations, plenty for casual use
export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => chars[b % chars.length]).join('');
}
