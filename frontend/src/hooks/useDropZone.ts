import { useState, useCallback, DragEvent } from 'react';

interface UseDropZoneOptions {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function useDropZone({ onFiles, disabled }: UseDropZoneOptions) {
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }, [disabled, onFiles]);

  return { isDragging, onDragOver, onDragLeave, onDrop };
}
