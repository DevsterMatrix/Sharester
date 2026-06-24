import { useEffect, useRef } from 'react';
import QRCodeLib from 'qrcode';

interface Props {
  value: string;
  size?: number;
}

export function QRCode({ value, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: '#6366f1', light: '#00000000' },
    }).catch(console.error);
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-xl"
      aria-label={`QR code for ${value}`}
    />
  );
}
