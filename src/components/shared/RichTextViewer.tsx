import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextStyle from '@tiptap/extension-text-style';
import { cn } from '../../lib/cn';

interface RichTextViewerProps {
  content: string;
  className?: string;
}

/**
 * 只读 HTML 渲染器。使用 TipTap 的 editable:false 模式，
 * 保证与编辑器完全一致的渲染效果。
 * 适用于需要完整展示描述内容的场景。
 */
export function RichTextViewer({ content, className }: RichTextViewerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Image,
      Link.configure({
        openOnClick: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({
        nested: false,
      }),
      TextStyle,
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content: content || '',
    editable: false,
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = content || '';
    if (incoming !== current) {
      editor.commands.setContent(incoming, false);
    }
  }, [content, editor]);

  if (!content || content === '<p></p>') return null;

  return (
    <div className={cn('prose prose-sm max-w-none', className)}>
      <EditorContent editor={editor} />
    </div>
  );
}
