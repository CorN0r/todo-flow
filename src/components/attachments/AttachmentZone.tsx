import { useState, useEffect } from 'react';
import { ImagePlus, X, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useUploadAttachment, useDeleteAttachment, useAttachments } from '../../hooks/useAttachments';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getAttachmentFilePath } from '../../lib/db';
import type { Attachment } from '../../types/attachment';

interface AttachmentZoneProps {
  taskId: string;
}

function AttachmentThumbnail({ attachment }: { attachment: Attachment }) {
  const [src, setSrc] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const deleteMutation = useDeleteAttachment();

  useEffect(() => {
    getAttachmentFilePath(attachment.id).then((path) => {
      setSrc(convertFileSrc(path));
    });
  }, [attachment.id]);

  return (
    <>
      <div className="relative group aspect-square rounded-lg overflow-hidden bg-muted border">
        {src ? (
          <img
            src={src}
            alt={attachment.original_name}
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => setShowPreview(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            Loading...
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => setShowPreview(true)}
            className="p-1 rounded bg-white/80 hover:bg-white text-foreground"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={() => deleteMutation.mutate(attachment.id)}
            className="p-1 rounded bg-white/80 hover:bg-red-50 text-red-500"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {showPreview && src && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center cursor-pointer"
          onClick={() => setShowPreview(false)}
        >
          <img
            src={src}
            alt={attachment.original_name}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

export function AttachmentZone({ taskId }: AttachmentZoneProps) {
  const { data: attachments } = useAttachments(taskId);
  const uploadMutation = useUploadAttachment();
  const [isDragOver, setIsDragOver] = useState(false);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Attachments ({attachments?.length || 0})
        </h4>
        <button
          onClick={handleAddFile}
          disabled={uploadMutation.isPending}
          className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
        >
          <ImagePlus size={14} />
          {uploadMutation.isPending ? 'Uploading...' : 'Add image'}
        </button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); }}
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        )}
      >
        <p className="text-xs text-muted-foreground">
          Drop images here, or click "Add image".
        </p>
      </div>

      {attachments && attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((att) => (
            <AttachmentThumbnail key={att.id} attachment={att} />
          ))}
        </div>
      )}
    </div>
  );
}
