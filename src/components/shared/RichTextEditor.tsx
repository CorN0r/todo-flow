import { useEffect, useLayoutEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import { Portal } from './Portal';
import { getRepositories } from '../../domain/repositories/current';
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
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading1, Heading2,
  Heading3, Quote, Code, List, ListOrdered, CheckSquare, Link as LinkIcon,
  ImageIcon, Table as TableIcon, Pilcrow,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Trash2, SquareSlash, Maximize2, Minimize2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { toast } from 'sonner';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  variant?: 'default' | 'sticky';
}

import { Extension } from '@tiptap/core';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** 模块级计数器：粘贴/拖放进行中时阻止 sync 清掉未完成的图片插入 */
let pendingImageInserts = 0;
/** 模块级 ref：让 ProseMirror 粘贴插件能访问 TipTap editor */
let editorForPaste: any = null;

/**
 * 图片粘贴/拖放处理 — 独立扩展，不干扰 Image 节点的解析和渲染。
 */
const ImagePasteHandler = Extension.create({
  name: 'imagePasteHandler',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('imagePasteHandler'),
        props: {
          handleDOMEvents: {
            dragover(_view, event) {
              if (event.dataTransfer?.types?.includes('Files')) {
                event.preventDefault();
                return true;
              }
              return false;
            },
          },
          handlePaste(_view, event) {
            const items = event.clipboardData?.items;
            if (!items) return false;
            // 收集所有图片文件
            const imageFiles: File[] = [];
            for (const item of Array.from(items)) {
              if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
              }
            }
            if (imageFiles.length === 0) return false;
            event.preventDefault();
            pendingImageInserts += imageFiles.length;
            for (const file of imageFiles) {
              if (file.size > 2 * 1024 * 1024) {
                toast.warning('图片超过 2MB，可能影响性能');
              }
              const reader = new FileReader();
              reader.onload = () => {
                // 用 insertContentAt（与拖放一致），避免 view.dispatch 的事务冲突
                const ed = editorForPaste;
                if (ed) {
                  ed.chain().focus().insertContentAt(ed.state.selection.from, {
                    type: 'image',
                    attrs: { src: reader.result as string },
                  }).run();
                }
                pendingImageInserts--;
              };
              reader.onerror = () => { pendingImageInserts--; };
              reader.readAsDataURL(file);
            }
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * 选区高亮扩展：当文本选区覆盖图片时，给图片加视觉标记。
 * ProseMirror 只在 NodeSelection 时加 ProseMirror-selectednode，
 * 多图片被文本选区框选时没有反馈，此扩展弥补这一不足。
 */
const ImageSelectionHighlight = Extension.create({
  name: 'imageSelectionHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('imageSelectionHighlight'),
        state: {
          init(_, state) {
            return computeImageDecos(state);
          },
          apply(tr, oldDecos, _oldState, newState) {
            if (!tr.docChanged && !tr.selectionSet) return oldDecos;
            return computeImageDecos(newState);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

function computeImageDecos(state: any): DecorationSet {
  const { from, to } = state.selection;
  // 只在有实际选区范围时处理（非光标、非 NodeSelection）
  if (from === to) return DecorationSet.empty;
  if (state.selection.constructor.name === 'NodeSelection') return DecorationSet.empty;
  const decos: Decoration[] = [];
  state.doc.nodesBetween(from, to, (node: any, pos: number) => {
    if (node.type.name === 'image') {
      decos.push(Decoration.node(pos, pos + node.nodeSize, {
        class: 'img-in-selection',
      }));
    }
    return true;
  });
  return DecorationSet.create(state.doc, decos);
}

function ToolbarButton({
  onClick, active, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded transition-colors',
        active
          ? 'text-[#7C72F6] bg-[#7C72F6]/[0.10] dark:bg-[#7C72F6]/[0.15]'
          : 'text-[#6B7280] hover:text-[#374151] dark:hover:text-white/70 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06]',
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-4 bg-[#E5E7EB] dark:bg-white/[0.10] mx-1" />;
}

/**
 * 安全地将 HTML 内容载入编辑器。
 * ProseMirror 内置的 DOMParser 会丢弃 data: URL 的 <img> 标签，
 * 这里用浏览器 DOMParser 分解 HTML → 文本用 insertContentAt → 图片用 setImage 绕过解析。
 */
function safeSetHTMLContent(editor: ReturnType<typeof useEditor>, html: string) {
  if (!editor) return;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  // 收集顶层节点
  type ParsedNode = { type: 'p'; html: string } | { type: 'img'; src: string; alt?: string };
  const nodes: ParsedNode[] = [];
  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' ||
        tag === 'blockquote' || tag === 'ul' || tag === 'ol' || tag === 'pre') {
      nodes.push({ type: 'p', html: el.outerHTML });
    } else if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (src) nodes.push({ type: 'img', src, alt: el.getAttribute('alt') || undefined });
    }
  }

  // 逐节点插入（图片绕过 DOMParser）
  editor.commands.clearContent();
  for (const n of nodes) {
    if (n.type === 'p') {
      editor.commands.insertContentAt(editor.state.doc.content.size, n.html, { updateSelection: false });
    } else if (n.type === 'img') {
      const node = editor.schema.nodes.image.create({ src: n.src, alt: n.alt || null });
      editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, node));
    }
  }
  // 清除残留空开头段落
  const first = editor.state.doc.firstChild;
  if (first && first.type.name === 'paragraph' && first.content.size === 0 && editor.state.doc.childCount > 1) {
    editor.view.dispatch(editor.state.tr.delete(0, first.nodeSize));
  }
  // 确保不选中任何节点，光标放文档末尾
  const endSel = TextSelection.create(editor.state.doc, editor.state.doc.content.size);
  editor.view.dispatch(editor.state.tr.setSelection(endSel));
  // 延迟失焦
  requestAnimationFrame(() => {
    editor.view.dom.blur();
  });
}

// ═══════════════════════════════════════════
// 共享的 TipTap 扩展列表
// ═══════════════════════════════════════════
const SHARED_EXTENSIONS = (placeholder: string) => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
  Underline,
  TextStyle,
  Highlight.configure({ multicolor: true }),
  Link.configure({ openOnClick: false, autolink: true }),
  Image,
  ImagePasteHandler,
  ImageSelectionHighlight,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem.configure({ nested: false }),
  Placeholder.configure({ placeholder }),
];

const EDITOR_ATTRIBUTES = (extra: string) =>
  cn('prose prose-sm max-w-none outline-none', extra, 'text-[#111827] dark:text-white/90');

// ═══════════════════════════════════════════
// 主编辑器组件
// ═══════════════════════════════════════════
export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder = '添加描述...',
  variant = 'default',
}: RichTextEditorProps) {
  // 🔍 诊断：追踪 value prop
  useEffect(() => {
    console.log(`[EDITOR value prop] len=${value.length} hasImg=${/<img[^>]+src="data:/.test(value)} first80="${value.slice(0, 80)}"`);
  }, [value]);

  // ★ 用 useMemo 稳定扩展列表引用，防止每帧重建编辑器
  const extensions = useMemo(() => SHARED_EXTENSIONS(placeholder), [placeholder]);

  // ★ content 传入 useEditor + useLayoutEffect 双重保障
  const editor = useEditor({
    extensions,
    content: value || '',
    editorProps: {
      attributes: {
        class: EDITOR_ATTRIBUTES('px-4 py-3 min-h-[280px] max-h-[600px] overflow-y-auto'),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const hasImg = /<img[^>]+src="data:/.test(html);
      console.log(`[EDITOR onUpdate] html len=${html.length} hasImg=${hasImg}`);
      if (html === '<p></p>') {
        onChange('');
      } else {
        onChange(html);
      }
    },
    onBlur: ({ editor: ed }) => {
      console.log('[EDITOR onBlur] firing');
      // 失焦时清除图片选中（NodeSelection → TextSelection）
      const sel = ed.state.selection;
      if (sel && 'node' in sel) {
        const end = sel.from + (sel as any).node.nodeSize;
        ed.view.dispatch(ed.state.tr.setSelection(
          TextSelection.create(ed.state.doc, Math.min(end, ed.state.doc.content.size))
        ));
      }
      onBlur?.();
    },
    onCreate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const hasImg = /<img[^>]+src="data:/.test(html);
      console.log(`[EDITOR onCreate] html len=${html.length} hasImg=${hasImg}`);
    },
  });

  // 同步外部 value 变化（任务切换等场景）
  const syncingRef = useRef(false);
  useLayoutEffect(() => {
    if (!editor || syncingRef.current || pendingImageInserts > 0) return;
    const current = editor.getHTML();
    const incoming = value || '';
    if (incoming !== current && incoming !== '<p></p>') {
      console.log(`[EDITOR sync] current=${current.length} incoming=${incoming.length}`);
      syncingRef.current = true;
      safeSetHTMLContent(editor, incoming);
      console.log(`[EDITOR sync] AFTER len=${editor.getHTML().length} hasImg=${/<img[^>]+src="data:/.test(editor.getHTML())}`);
      syncingRef.current = false;
    }
  }, [editor, value]);

  // ── 链接弹窗状态 ──
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const linkNeedsTextRef = useRef(false);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const prevUrl = editor.getAttributes('link').href || '';
    setLinkUrl(prevUrl);
    linkNeedsTextRef.current = editor.state.selection.empty;
    setLinkText('');
    setShowLinkDialog(true);
  }, [editor]);

  const confirmLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) return;
    const url = linkUrl.trim();
    if (linkNeedsTextRef.current && linkText.trim()) {
      editor.chain().focus().insertContent({ type: 'text', text: linkText.trim() }).run();
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setShowLinkDialog(false);
  }, [editor, linkUrl, linkText]);

  const removeLink = useCallback(() => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    setShowLinkDialog(false);
  }, [editor]);

  // ── 表格弹窗状态 ──
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [tableRows, setTableRows] = useState('3');
  const [tableCols, setTableCols] = useState('3');

  const confirmTable = useCallback(() => {
    if (!editor) return;
    const rows = parseInt(tableRows, 10);
    const cols = parseInt(tableCols, 10);
    if (isNaN(rows) || rows < 1 || rows > 20) { toast.error('行数请输入 1~20'); return; }
    if (isNaN(cols) || cols < 1 || cols > 10) { toast.error('列数请输入 1~10'); return; }
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setShowTableDialog(false);
  }, [editor, tableRows, tableCols]);

  // ── 全屏编辑状态 ──
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenInitRef = useRef('');

  const toggleHeading = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('heading', { level: 1 })) editor.chain().focus().toggleHeading({ level: 2 }).run();
    else if (editor.isActive('heading', { level: 2 })) editor.chain().focus().toggleHeading({ level: 3 }).run();
    else if (editor.isActive('heading', { level: 3 })) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: 1 }).run();
  }, [editor]);

  const headingLevel = editor?.isActive('heading', { level: 1 }) ? 1
    : editor?.isActive('heading', { level: 2 }) ? 2
    : editor?.isActive('heading', { level: 3 }) ? 3 : 0;

  const isSticky = variant === 'sticky';
  const containerRef = useRef<HTMLDivElement>(null);

  // 同步 editor 到模块级变量，供 ProseMirror 粘贴插件使用
  useEffect(() => { editorForPaste = editor; }, [editor]);

  // 用 ref 保持 editor 引用稳定，避免监听器重复注册
  const editorRef = useRef(editor);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // ── Tauri 窗口级文件拖放监听（只注册一次）──
  useEffect(() => {
    const promise = getRepositories().platform.onFileDrop(({ paths, position: pos }) => {
      if (!containerRef.current) return;
      // 检查是否在编辑器容器内
      const el = document.elementFromPoint(pos.x, pos.y);
      if (!el || !containerRef.current.contains(el)) return;
      const ed = editorRef.current;
      if (!ed) return;
      for (const p of paths) {
        const ext = p.split('.').pop()?.toLowerCase();
        if (!ext || !['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) continue;
        pendingImageInserts++;
        getRepositories().platform.readFileBytes(p).then((bytes) => {
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
          }
          const base64 = btoa(binary);
          const dataUrl = `data:${mime};base64,${base64}`;
          const coords = { left: pos.x, top: pos.y };
          const pmPos = ed.view.posAtCoords(coords);
          const insertPos = pmPos ? pmPos.pos : ed.state.selection.from;
          ed.chain().focus().insertContentAt(insertPos, {
            type: 'image',
            attrs: { src: dataUrl },
          }).run();
          pendingImageInserts--;
        }).catch((err) => {
          pendingImageInserts--;
          console.error(`[DRAG] readFile error for "${p}":`, err);
          toast.error(`读取文件失败: ${(err as any)?.message || err}`);
        });
      }
    });
    return () => { promise.then((fn) => fn()); };
  }, []); // 只在挂载/卸载时注册/注销

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col border rounded-[10px] overflow-hidden transition-colors min-h-[280px]',
        'border-[#E5E7EB] dark:border-white/[0.07]',
        'focus-within:ring-2 focus-within:ring-[#7C72F6]/30 focus-within:border-[#7C72F6]',
        isSticky && 'border-white/[0.08] bg-white/[0.04]',
      )}
    >
      {/* ── 工具栏 ── */}
      <div
        className={cn(
          'flex items-center gap-0.5 px-2 py-1.5 border-b flex-wrap',
          'bg-[#F9FAFB] dark:bg-white/[0.02]',
          'border-[#F3F4F6] dark:border-white/[0.06]',
          isSticky && 'bg-white/[0.02] border-white/[0.06]',
        )}
      >
        {/* 格式组 */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗体 (Ctrl+B)">
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体 (Ctrl+I)">
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线 (Ctrl+U)">
          <UnderlineIcon size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线">
          <Strikethrough size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* 块级组 */}
        <ToolbarButton onClick={toggleHeading} active={headingLevel > 0} title={`标题 ${headingLevel || ''}（点击切换 H1→H2→H3→正文）`}>
          {headingLevel === 1 ? <Heading1 size={14} /> : headingLevel === 2 ? <Heading2 size={14} /> : headingLevel === 3 ? <Heading3 size={14} /> : <Pilcrow size={14} />}
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
          <Quote size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="行内代码">
          <Code size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* 列表组 */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="任务列表">
          <CheckSquare size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* 插入组 */}
        <ToolbarButton onClick={openLinkDialog} active={editor.isActive('link')} title="链接">
          <LinkIcon size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => toast.info('直接粘贴图片即可插入，或拖放图片到编辑区')} title="图片（Ctrl+V 粘贴）">
          <ImageIcon size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => setShowTableDialog(true)} title="插入表格（自定义行列）">
          <TableIcon size={14} />
        </ToolbarButton>

        {/* 全屏按钮 */}
        <div className="flex-1" />
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => { fullscreenInitRef.current = editor.getHTML(); setIsFullscreen(true); }}
          title="全屏编辑"
        >
          <Maximize2 size={14} />
        </ToolbarButton>
      </div>

      {/* ── 表格专用工具栏（仅在表格中显示）── */}
      {editor.isActive('table') && (
        <div className={cn(
          'flex items-center gap-0.5 px-2 py-1 border-b flex-wrap',
          'bg-[#F0F0FF] dark:bg-[#7C72F6]/[0.06]',
          'border-[#E5E7EB] dark:border-white/[0.06]',
          isSticky && 'bg-white/[0.04] border-white/[0.06]',
        )}>
          <span className="text-[10px] font-semibold text-[#7C72F6] mr-1 shrink-0">表格</span>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().addRowBefore().run()} title="上方插入行"><ArrowUp size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="下方插入行"><ArrowDown size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addColumnBefore().run()} title="左侧插入列"><ArrowLeft size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="右侧插入列"><ArrowRight size={13} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="删除当前行"><SquareSlash size={13} /><span className="text-[10px] ml-0.5">行</span></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="删除当前列"><SquareSlash size={13} /><span className="text-[10px] ml-0.5">列</span></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="删除整个表格"><Trash2 size={13} className="text-red-400" /></ToolbarButton>
        </div>
      )}

      {/* ── 编辑区 ── */}
      <EditorContent editor={editor} />

      {/* ── Bubble 菜单（选中文字时浮现）── */}
      <BubbleMenu editor={editor}
        shouldShow={({ editor: ed }) => !('node' in ed.state.selection)}
        tippyOptions={{ duration: 150, placement: 'top' }}
        className="flex items-center gap-0.5 bg-white dark:bg-[#1E1E32] border border-[#E5E7EB] dark:border-white/[0.10] rounded-lg shadow-lg px-1 py-1">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗体"><Bold size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体"><Italic size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线"><UnderlineIcon size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线"><Strikethrough size={13} /></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton onClick={openLinkDialog} active={editor.isActive('link')} title="链接"><LinkIcon size={13} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="高亮">
          <span className="text-[11px] font-bold">A</span>
        </ToolbarButton>
      </BubbleMenu>

      {/* ── 链接弹窗 ── */}
      {showLinkDialog && (
        <Portal>
          <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onClick={() => setShowLinkDialog(false)}>
            <div className="bg-white dark:bg-[#1e1e32] rounded-2xl shadow-2xl p-5 mx-4 max-w-[380px] w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-[#111827] dark:text-white/90 mb-4 font-medium">插入链接</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-[#6B7280] mb-1 block">链接地址</label>
                  <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmLink(); if (e.key === 'Escape') setShowLinkDialog(false); }}
                    placeholder="https://..."
                    className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6] placeholder:text-[#9CA3AF]" />
                </div>
                {linkNeedsTextRef.current && (
                  <div>
                    <label className="text-[11px] font-medium text-[#6B7280] mb-1 block">显示文本</label>
                    <input value={linkText} onChange={(e) => setLinkText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmLink(); if (e.key === 'Escape') setShowLinkDialog(false); }}
                      placeholder="链接显示的文字"
                      className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6] placeholder:text-[#9CA3AF]" />
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-4">
                <div>
                  {editor.isActive('link') && (
                    <button onClick={removeLink} className="px-3 py-2 rounded-lg text-[12px] text-[#EF4444] hover:bg-[#FEF2F2] dark:hover:bg-red-950/30 transition-colors">移除链接</button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowLinkDialog(false)} className="px-4 py-2 rounded-lg text-[13px] text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors">取消</button>
                  <button onClick={confirmLink} disabled={!linkUrl.trim()} className="px-4 py-2 rounded-lg text-[13px] bg-[#7C72F6] text-white hover:bg-[#6D63E6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">确认</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── 表格弹窗 ── */}
      {showTableDialog && (
        <Portal>
          <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center" onClick={() => setShowTableDialog(false)}>
            <div className="bg-white dark:bg-[#1e1e32] rounded-2xl shadow-2xl p-5 mx-4 max-w-[300px] w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-[#111827] dark:text-white/90 mb-4 font-medium">插入表格</p>
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-[#6B7280] mb-1 block">行数</label>
                  <input type="number" min={1} max={20} autoFocus value={tableRows} onChange={(e) => setTableRows(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmTable(); if (e.key === 'Escape') setShowTableDialog(false); }}
                    className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6]" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-[#6B7280] mb-1 block">列数</label>
                  <input type="number" min={1} max={10} value={tableCols} onChange={(e) => setTableCols(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmTable(); if (e.key === 'Escape') setShowTableDialog(false); }}
                    className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6]" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTableDialog(false)} className="px-4 py-2 rounded-lg text-[13px] text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors">取消</button>
                <button onClick={confirmTable} className="px-4 py-2 rounded-lg text-[13px] bg-[#7C72F6] text-white hover:bg-[#6D63E6] transition-colors font-medium">插入</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── 全屏编辑 Overlay ── */}
      {isFullscreen && (
        <FullscreenEditor
          initialContent={fullscreenInitRef.current}
          placeholder={placeholder}
          onClose={(html) => {
            if (editor && html !== editor.getHTML()) {
              safeSetHTMLContent(editor, html);
              onChange(html || '');
            }
            setIsFullscreen(false);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 全屏编辑器子组件
// ═══════════════════════════════════════════
function FullscreenEditor({
  initialContent,
  placeholder,
  onClose,
}: {
  initialContent: string;
  placeholder: string;
  onClose: (html: string) => void;
}) {
  const extensions = useMemo(() => SHARED_EXTENSIONS(placeholder), [placeholder]);

  const editor = useEditor({
    extensions,
    editorProps: {
      attributes: {
        class: EDITOR_ATTRIBUTES('px-6 py-5 min-h-[60vh]'),
      },
    },
  });

  // 安全载入初始内容
  useLayoutEffect(() => {
    if (editor && initialContent) {
      safeSetHTMLContent(editor, initialContent);
    }
  }, [editor, initialContent]);

  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const linkNeedsRef = useRef(false);

  const [showTableDialog, setShowTableDialog] = useState(false);
  const [tableRows, setTableRows] = useState('3');
  const [tableCols, setTableCols] = useState('3');

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const prevUrl = editor.getAttributes('link').href || '';
    setLinkUrl(prevUrl);
    linkNeedsRef.current = editor.state.selection.empty;
    setLinkText('');
    setShowLinkDialog(true);
  }, [editor]);

  const confirmLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) return;
    const url = linkUrl.trim();
    if (linkNeedsRef.current && linkText.trim()) {
      editor.chain().focus().insertContent({ type: 'text', text: linkText.trim() }).run();
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setShowLinkDialog(false);
  }, [editor, linkUrl, linkText]);

  const confirmTable = useCallback(() => {
    if (!editor) return;
    const rows = parseInt(tableRows, 10);
    const cols = parseInt(tableCols, 10);
    if (isNaN(rows) || rows < 1 || rows > 20) { toast.error('行数请输入 1~20'); return; }
    if (isNaN(cols) || cols < 1 || cols > 10) { toast.error('列数请输入 1~10'); return; }
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    setShowTableDialog(false);
  }, [editor, tableRows, tableCols]);

  const toggleHeading = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('heading', { level: 1 })) editor.chain().focus().toggleHeading({ level: 2 }).run();
    else if (editor.isActive('heading', { level: 2 })) editor.chain().focus().toggleHeading({ level: 3 }).run();
    else if (editor.isActive('heading', { level: 3 })) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: 1 }).run();
  }, [editor]);

  const headingLevel = editor?.isActive('heading', { level: 1 }) ? 1
    : editor?.isActive('heading', { level: 2 }) ? 2
    : editor?.isActive('heading', { level: 3 }) ? 3 : 0;

  const handleClose = useCallback(() => {
    onClose(editor?.getHTML() || '');
  }, [editor, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  if (!editor) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[250] bg-white dark:bg-[#1e1e32] flex flex-col">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#F3F4F6] dark:border-white/[0.06] shrink-0">
          <span className="text-[13px] font-medium text-[#111827] dark:text-white/90">全屏编辑 · 描述</span>
          <button onClick={handleClose}
            className="flex items-center gap-1.5 text-[12px] text-[#6B7280] hover:text-[#111827] dark:hover:text-white/90 px-3 py-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors">
            <Minimize2 size={14} />退出全屏
          </button>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-[#F3F4F6] dark:border-white/[0.06] bg-[#F9FAFB] dark:bg-white/[0.02] shrink-0">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗体"><Bold size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体"><Italic size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线"><UnderlineIcon size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线"><Strikethrough size={14} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={toggleHeading} active={headingLevel > 0} title="标题">
            {headingLevel === 1 ? <Heading1 size={14} /> : headingLevel === 2 ? <Heading2 size={14} /> : headingLevel === 3 ? <Heading3 size={14} /> : <Pilcrow size={14} />}
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用"><Quote size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="行内代码"><Code size={14} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表"><List size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表"><ListOrdered size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="任务列表"><CheckSquare size={14} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={openLinkDialog} active={editor.isActive('link')} title="链接"><LinkIcon size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => toast.info('直接粘贴图片即可插入，或拖放图片到编辑区')} title="图片"><ImageIcon size={14} /></ToolbarButton>
          <ToolbarButton onClick={() => setShowTableDialog(true)} title="插入表格"><TableIcon size={14} /></ToolbarButton>
        </div>

        {/* 表格工具栏 */}
        {editor.isActive('table') && (
          <div className="flex items-center gap-0.5 px-3 py-1 border-b border-[#E5E7EB] dark:border-white/[0.06] bg-[#F0F0FF] dark:bg-[#7C72F6]/[0.06] shrink-0">
            <span className="text-[10px] font-semibold text-[#7C72F6] mr-1">表格</span>
            <ToolbarDivider />
            <ToolbarButton onClick={() => editor.chain().focus().addRowBefore().run()} title="上方插入行"><ArrowUp size={13} /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="下方插入行"><ArrowDown size={13} /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addColumnBefore().run()} title="左侧插入列"><ArrowLeft size={13} /></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="右侧插入列"><ArrowRight size={13} /></ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="删除当前行"><SquareSlash size={13} /><span className="text-[10px] ml-0.5">行</span></ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="删除当前列"><SquareSlash size={13} /><span className="text-[10px] ml-0.5">列</span></ToolbarButton>
            <ToolbarDivider />
            <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="删除整个表格"><Trash2 size={13} className="text-red-400" /></ToolbarButton>
          </div>
        )}

        {/* 编辑区 */}
        <div className="flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>

        {/* BubbleMenu */}
        <BubbleMenu editor={editor}
          shouldShow={({ editor: ed }) => !('node' in ed.state.selection)}
          tippyOptions={{ duration: 150, placement: 'top' }}
          className="flex items-center gap-0.5 bg-white dark:bg-[#1E1E32] border border-[#E5E7EB] dark:border-white/[0.10] rounded-lg shadow-lg px-1 py-1">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗体"><Bold size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体"><Italic size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线"><UnderlineIcon size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线"><Strikethrough size={13} /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={openLinkDialog} active={editor.isActive('link')} title="链接"><LinkIcon size={13} /></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="高亮">
            <span className="text-[11px] font-bold">A</span>
          </ToolbarButton>
        </BubbleMenu>
      </div>

      {/* 链接弹窗 */}
      {showLinkDialog && (
        <Portal>
          <div className="fixed inset-0 z-[350] bg-black/40 flex items-center justify-center" onClick={() => setShowLinkDialog(false)}>
            <div className="bg-white dark:bg-[#1e1e32] rounded-2xl shadow-2xl p-5 mx-4 max-w-[380px] w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-[#111827] dark:text-white/90 mb-4 font-medium">插入链接</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-[#6B7280] mb-1 block">链接地址</label>
                  <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmLink(); if (e.key === 'Escape') setShowLinkDialog(false); }}
                    placeholder="https://..."
                    className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6] placeholder:text-[#9CA3AF]" />
                </div>
                {linkNeedsRef.current && (
                  <div>
                    <label className="text-[11px] font-medium text-[#6B7280] mb-1 block">显示文本</label>
                    <input value={linkText} onChange={(e) => setLinkText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmLink(); if (e.key === 'Escape') setShowLinkDialog(false); }}
                      placeholder="链接显示的文字"
                      className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6] placeholder:text-[#9CA3AF]" />
                  </div>
                )}
              </div>
              <div className="flex justify-end items-center mt-4 gap-2">
                <button onClick={() => { editor?.chain().focus().extendMarkRange('link').unsetLink().run(); setShowLinkDialog(false); }}
                  className="px-3 py-2 rounded-lg text-[12px] text-[#EF4444] hover:bg-[#FEF2F2] dark:hover:bg-red-950/30 transition-colors">移除链接</button>
                <div className="flex-1" />
                <button onClick={() => setShowLinkDialog(false)} className="px-4 py-2 rounded-lg text-[13px] text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors">取消</button>
                <button onClick={confirmLink} disabled={!linkUrl.trim()} className="px-4 py-2 rounded-lg text-[13px] bg-[#7C72F6] text-white hover:bg-[#6D63E6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">确认</button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* 表格弹窗 */}
      {showTableDialog && (
        <Portal>
          <div className="fixed inset-0 z-[350] bg-black/40 flex items-center justify-center" onClick={() => setShowTableDialog(false)}>
            <div className="bg-white dark:bg-[#1e1e32] rounded-2xl shadow-2xl p-5 mx-4 max-w-[300px] w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm text-[#111827] dark:text-white/90 mb-4 font-medium">插入表格</p>
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-[#6B7280] mb-1 block">行数</label>
                  <input type="number" min={1} max={20} autoFocus value={tableRows} onChange={(e) => setTableRows(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmTable(); if (e.key === 'Escape') setShowTableDialog(false); }}
                    className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6]" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-[#6B7280] mb-1 block">列数</label>
                  <input type="number" min={1} max={10} value={tableCols} onChange={(e) => setTableCols(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmTable(); if (e.key === 'Escape') setShowTableDialog(false); }}
                    className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-white/[0.07] bg-[#F9FAFB] dark:bg-white/[0.03] text-[#111827] dark:text-white/90 outline-none focus:ring-2 focus:ring-[#7C72F6]/30 focus:border-[#7C72F6]" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTableDialog(false)} className="px-4 py-2 rounded-lg text-[13px] text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors">取消</button>
                <button onClick={confirmTable} className="px-4 py-2 rounded-lg text-[13px] bg-[#7C72F6] text-white hover:bg-[#6D63E6] transition-colors font-medium">插入</button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </Portal>
  );
}
