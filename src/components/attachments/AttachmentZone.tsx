import { useState, useEffect } from 'react';
import { X, FileText, File, Link, Paperclip } from 'lucide-react';
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

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'];

function getFileTypeIcon(mimeType: string) {
  if (IMAGE_TYPES.includes(mimeType)) return null;
  if (mimeType === 'application/pdf') return { icon: FileText, color: 'text-red-500', label: 'PDF' };
  if (mimeType.includes('word') || mimeType.includes('document')) return { icon: FileText, color: 'text-blue-500', label: 'DOC' };
  if (mimeType === 'text/plain') return { icon: FileText, color: 'text-gray-500', label: 'TXT' };
  if (mimeType === 'application/link') return { icon: Link, color: 'text-violet-500', label: 'URL' };
  return { icon: File, color: 'text-[#6B7280]', label: 'FILE' };
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
  const isImage = IMAGE_TYPES.includes(attachment.mime_type);

  useEffect(() => {
    if (isImage) {
      getAttachmentFilePath(attachment.id).then((path) => {
        setSrc(convertFileSrc(path));
      });
    }
  }, [attachment.id, isImage]);

  const fileInfo = getFileTypeIcon(attachment.mime_type);

  if (isImage) {
    return (
      <div className="relative group aspect-square rounded-lg overflow-hidden bg-[#F3F4F6] dark:bg-white/[0.06] border border-[#F3F4F6] dark:border-white/[0.06]">
        {src ? (
          <img
            src={src}
            alt={attachment.original_name}
            className="w-full h-full object-cover cursor-pointer"
            onClick={onClick}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#6B7280] border-t-[#6B7280] rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={onClick}
            className="p-1.5 rounded-md bg-white/80 hover:bg-white text-[#111827] dark:text-white/90 transition-colors"
            aria-label="Preview"
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

  // Non-image file card
  const Icon = fileInfo?.icon || File;
  return (
    <div className="relative group aspect-square rounded-lg bg-[#F3F4F6] dark:bg-white/[0.06] border border-[#F3F4F6] dark:border-white/[0.06] flex flex-col items-center justify-center gap-1 p-2">
      <Icon size={28} className={fileInfo?.color || 'text-[#6B7280]'} />
      <span className="text-[10px] text-[#6B7280] font-medium truncate max-w-full text-center leading-tight">
        {attachment.original_name}
      </span>
      <span className="text-[9px] text-[#9CA3AF]">{fileInfo?.label || 'FILE'}</span>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
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
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');

  const handleAddFile = async () => {
    const selected = await open({
      multiple: true,
      filters: [{
        name: 'All Files',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'json', 'xml', 'html', 'zip'],
      }],
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        uploadMutation.mutate({ taskId, sourcePath: path });
      }
    }
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) return;
    uploadMutation.mutate({ taskId, sourcePath: linkUrl.trim(), isLink: true, linkTitle: linkTitle.trim() || undefined });
    setLinkUrl('');
    setLinkTitle('');
    setShowLinkInput(false);
  };

  const handleDragDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i] as unknown as { path: string };
      if (file.path) {
        uploadMutation.mutate({ taskId, sourcePath: file.path });
      }
    }
  };

  const allAttachments = attachments || [];
  const imageAttachments = allAttachments.filter((a) => IMAGE_TYPES.includes(a.mime_type));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-[#6B7280] uppercase tracking-wider">
          Attachments ({allAttachments.length})
        </h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLinkInput(!showLinkInput)}
            className="text-xs flex items-center gap-1 text-[#7C72F6] hover:text-[#7C72F6] transition-colors"
            aria-label="Add link"
          >
            <Link size={14} />
            Link
          </button>
          <button
            onClick={handleAddFile}
            disabled={uploadMutation.isPending}
            className="text-xs flex items-center gap-1 text-[#7C72F6] hover:text-[#7C72F6] transition-colors"
            aria-label="Add file attachment"
          >
            <Paperclip size={14} />
            {uploadMutation.isPending ? 'Uploading...' : 'File'}
          </button>
        </div>
      </div>

      {showLinkInput && (
        <div className="flex flex-col gap-2 p-3 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03]">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); if (e.key === 'Escape') setShowLinkInput(false); }}
            placeholder="https://..."
            className="text-xs px-2 py-1.5 rounded border border-[#E5E7EB] dark:border-white/[0.07] bg-white dark:bg-white/[0.06] outline-none focus:ring-1 focus:ring-[#7C72F6]"
          />
          <input
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            placeholder="Title (optional)"
            className="text-xs px-2 py-1.5 rounded border border-[#E5E7EB] dark:border-white/[0.07] bg-white dark:bg-white/[0.06] outline-none focus:ring-1 focus:ring-[#7C72F6]"
          />
          <div className="flex gap-2">
            <button onClick={handleAddLink} className="text-xs px-3 py-1 rounded bg-[#7C72F6] text-white">Add</button>
            <button onClick={() => setShowLinkInput(false)} className="text-xs px-3 py-1 rounded text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]">Cancel</button>
          </div>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDragDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
          isDragOver
            ? 'border-[#7C72F6] bg-[#F3F4F6] dark:bg-white/[0.06]'
            : 'border-[#6B7280] hover:border-[#6B7280]',
        )}
      >
        <p className="text-xs text-[#6B7280]">
          Drop files here, or click "File" / "Link".
        </p>
      </div>

      {allAttachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {allAttachments.map((att) => (
            <AttachmentThumbnail
              key={att.id}
              attachment={att}
              onClick={() => {
                if (IMAGE_TYPES.includes(att.mime_type)) {
                  const imgIdx = imageAttachments.indexOf(att);
                  if (imgIdx >= 0) setLightboxIndex(imgIdx);
                } else if (att.mime_type === 'application/link') {
                  window.open(att.original_name, '_blank');
                }
              }}
            />
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox
          attachments={imageAttachments}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
