import { useRef, useState, useCallback } from 'react';
import { Bold, Italic, Image, Save } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange?: (html: string) => void;
  onSave: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, onSave, placeholder = '输入内容...' }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value || value === '<p><br></p>' || value === '<br>');

  const execCmd = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const img = document.createElement('img');
          img.src = reader.result as string;
          img.style.maxWidth = '100%';
          img.style.borderRadius = '6px';
          img.style.margin = '8px 0';
          const sel = window.getSelection();
          if (sel?.rangeCount) {
            sel.getRangeAt(0).insertNode(img);
            sel.collapse(img, 1);
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || '';
    const empty = !html || html === '<p><br></p>' || html === '<br>' || html === '<p></p>';
    setIsEmpty(empty);
    onChange?.(html);
  }, [onChange]);

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || '';
    if (!html || html === '<p><br></p>' || html === '<br>') return;
    onSave(html);
  };

  const setInitialContent = (el: HTMLDivElement | null) => {
    if (el && value && el.innerHTML !== value) {
      el.innerHTML = value;
    }
    (editorRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  return (
    <div className="border border-[#E5E7EB] dark:border-white/[0.07] rounded-[10px] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#F3F4F6] dark:border-white/[0.06] bg-[#F9FAFB] dark:bg-white/[0.02]">
        <button onClick={() => execCmd('bold')} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" title="粗体">
          <Bold size={14} className="text-[#6B7280]" />
        </button>
        <button onClick={() => execCmd('italic')} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors" title="斜体">
          <Italic size={14} className="text-[#6B7280]" />
        </button>
        <div className="w-px h-4 bg-[#E5E7EB] dark:bg-white/[0.08] mx-1" />
        <button onClick={() => execCmd('insertUnorderedList')} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-[11px] font-bold text-[#6B7280]" title="无序列表">•</button>
        <button onClick={() => execCmd('insertOrderedList')} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-[11px] font-bold text-[#6B7280]" title="有序列表">1.</button>
        <div className="flex-1" />
        <span className="text-[10px] text-[#9CA3AF]">支持粘贴图片</span>
        <Image size={13} className="text-[#9CA3AF] ml-1" />
      </div>

      {/* Editor area */}
      <div
        ref={setInitialContent}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        className="min-h-[80px] max-h-[400px] overflow-y-auto p-4 text-sm outline-none text-[#111827] dark:text-white/90 placeholder:text-[#9CA3AF]"
        data-placeholder={placeholder}
        style={{ wordBreak: 'break-word' }}
      />

      {/* Save button */}
      <div className="flex items-center justify-end px-3 py-2 border-t border-[#F3F4F6] dark:border-white/[0.06] bg-[#F9FAFB] dark:bg-white/[0.02]">
        <button
          onClick={handleSave}
          disabled={isEmpty}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#7C72F6] text-white text-[13px] font-medium hover:bg-[#6D63E6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={14} />
          保存
        </button>
      </div>
    </div>
  );
}
