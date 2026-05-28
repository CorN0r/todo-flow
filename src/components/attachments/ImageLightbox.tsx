import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getAttachmentFilePath } from '../../lib/db';
import type { Attachment } from '../../types/attachment';

interface Props {
  attachments: Attachment[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageLightbox({ attachments, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const total = attachments.length;
  const hasMultiple = total > 1;

  const loadImage = useCallback(async (i: number) => {
    setLoading(true);
    setSrc(null);
    const path = await getAttachmentFilePath(attachments[i].id);
    setSrc(convertFileSrc(path));
    setLoading(false);
  }, [attachments]);

  useEffect(() => {
    loadImage(index); // eslint-disable-line react-hooks/set-state-in-effect
  }, [index, loadImage]);

  // Preload adjacent images
  useEffect(() => {
    if (!hasMultiple) return;
    const preload = async () => {
      const nextIdx = (index + 1) % total;
      const prevIdx = (index - 1 + total) % total;
      for (const i of [prevIdx, nextIdx]) {
        const path = await getAttachmentFilePath(attachments[i].id);
        new Image().src = convertFileSrc(path);
      }
    };
    preload();
  }, [index, attachments, hasMultiple, total]);

  // Keyboard navigation — wrap around
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (!hasMultiple) return;
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + total) % total);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % total);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, hasMultiple, total]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const goNext = () => hasMultiple && setIndex((i) => (i + 1) % total);
  const goPrev = () => hasMultiple && setIndex((i) => (i - 1 + total) % total);

  const attachment = attachments[index];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/90 z-[200] flex flex-col items-center justify-center select-none"
        onClick={onClose}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-3 z-10">
          <div className="text-sm text-white/60 font-medium min-w-0 truncate mr-4">
            {attachment.original_name}
            {hasMultiple && (
              <span className="ml-3 text-white/40 tabular-nums">
                {index + 1} / {total}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors flex-shrink-0"
            aria-label="Close lightbox"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main image area */}
        <div
          className="flex-1 flex items-center justify-center w-full px-6 sm:px-16 pt-12 pb-20"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left arrow — always visible when multiple */}
          {hasMultiple && (
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Image */}
          <div className="flex items-center justify-center max-w-full max-h-full">
            {loading && (
              <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            )}
            {src && !loading && (
              <motion.img
                key={index}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                src={src}
                alt={attachment.original_name}
                className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-2xl"
              />
            )}
            {!src && !loading && (
              <p className="text-white/40 text-sm">Failed to load image</p>
            )}
          </div>

          {/* Right arrow — always visible when multiple */}
          {hasMultiple && (
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>

        {/* Thumbnail dots */}
        {hasMultiple && (
          <div className="absolute bottom-8 flex items-center gap-2">
            {attachments.map((att, i) => (
              <button
                key={att.id}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                className={`h-2 rounded-full transition-all duration-200 ${
                  i === index
                    ? 'bg-white w-6'
                    : 'bg-white/30 hover:bg-white/50 w-2'
                }`}
                aria-label={`View image ${i + 1}`}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
