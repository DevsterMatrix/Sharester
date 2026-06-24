/**
 * SHA-256 hasher using Web Crypto API.
 *
 * Reads the file in 4MB slices to avoid loading everything into memory at once,
 * then concatenates into one buffer for a single digest call.
 * This produces the same bytes as hashing the file as a whole.
 */

const SLICE = 4 * 1024 * 1024; // 4 MB

export async function hashFile(
  file: File | Blob,
  onProgress?: (pct: number) => void
): Promise<string> {
  const size   = file.size;
  const chunks = Math.ceil(size / SLICE) || 1;

  // Collect all slices
  const parts: Uint8Array[] = [];
  let totalBytes = 0;

  for (let i = 0; i < chunks; i++) {
    const start  = i * SLICE;
    const end    = Math.min(start + SLICE, size);
    const buf    = await file.slice(start, end).arrayBuffer();
    const bytes  = new Uint8Array(buf);
    parts.push(bytes);
    totalBytes  += bytes.byteLength;
    onProgress?.(Math.round(((i + 1) / chunks) * 100));
  }

  // Concatenate into one contiguous buffer
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }

  const digest = await crypto.subtle.digest('SHA-256', combined);
  return bufferToHex(digest);
}

export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
