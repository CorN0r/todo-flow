import { useState, useEffect } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useUploadAttachment, useDeleteAttachment, useAttachments } from '../../hooks/useAttachments';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getAttachmentFilePath } from '../../lib/db';
import { ImageLightbox } from './ImageLightbox';
import type { Attachment } from '../../types/attachment';

interface AttachmentZoneProps {
  taskId: string;
}

function AttachmentThumbnail({
  attachment,
  onClick,
}: {
  attachment: Attachment;
  onClick: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const deleteMutation = useDeleteAttachment();

  useEffect(() => {
    getAttachmentFilePath(attachment.id).then((path) => {
      setSrc(convertFileSrc(path));
    });
  }, [attachment.id]);

  return (
    <div className="relative group aspect-square rounded-lg overflow-hidden bg-muted border">
      {src ? (
        <img
          src={src}
          alt={attachment.original_name}
          className="w-full h-full object-cover cursor-pointer"
          onClick={onClick}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-muted-foreground border-t-muted-foreground rounded-full animate-spin" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
        <button
          onClick={onClick}
          className="p-1.5 rounded-md bg-white/80 hover:bg-white text-foreground transition-colors"
          aria-label="Preview image"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(attachment.id); }}
          className="p-1.5 rounded-md bg-white/80 hover:bg-red-50 text-red-500 transition-colors"
          aria-label="Delete attachment"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function AttachmentZone({ taskId }: AttachmentZoneProps) {
  const { data: attachments } = useAttachments(taskId);
  const uploadMutation = useUploadAttachment();
  const [isDragOver, setIsDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleAddFile = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        uploadMutation.mutate({ taskId, sourcePath: path });
      }
    }
  };

  const handleDragDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const file = e.dataTransfer.files[i] as unknown as { path: string };
      if (file.path) {
        uploadMutation.mutate({ taskId, sourcePath: file.path });
      }
    }
  };

  const allAttachments = attachments || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Attachments ({allAttachments.length})
        </h4>
        <button
          onClick={handleAddFile}
          disabled={uploadMutation.isPending}
          className="text-xs flex items-center gap-1 text-primary hover:text-primary transition-colors"
          aria-label="Add image attachment"
        >
          <ImagePlus size={14} />
          {uploadMutation.isPending ? 'Uploading...' : 'Add image'}
        </button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDragDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
          isDragOver
            ? 'border-primary bg-muted'
            : 'border-muted-foreground hover:border-muted-foreground',
        )}
      >
        <p className="text-xs text-muted-foreground">
          Drop images here, or click "Add image".
        </p>
      </div>

      {allAttachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {allAttachments.map((att, i) => (
            <AttachmentThumbnail
              key={att.id}
              attachment={att}
              onClick={() => setLightboxIndex(i)}
            />
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox
          attachments={allAttachments}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
