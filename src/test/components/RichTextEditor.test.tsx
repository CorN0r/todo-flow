import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RichTextEditor } from '../../components/shared/RichTextEditor';

const mockOnFileDrop = vi.fn<(handler: (payload: { paths: string[]; position: { x: number; y: number } }) => void) => Promise<() => void>>(
  () => Promise.resolve(() => {}),
);
const mockReadFileBytes = vi.fn<(path: string) => Promise<Uint8Array>>(() => Promise.resolve(new Uint8Array()));

vi.mock('@tiptap/react', async () => {
  const actual = await vi.importActual('@tiptap/react');
  return {
    ...actual,
    BubbleMenu: () => null,
  };
});

vi.mock('../../domain/repositories/current', () => ({
  getRepositories: () => ({
    platform: {
      onFileDrop: (handler: (payload: { paths: string[]; position: { x: number; y: number } }) => void) => mockOnFileDrop(handler),
      readFileBytes: (path: string) => mockReadFileBytes(path),
    },
  }),
  setRepositoriesForTesting: vi.fn(),
  resetRepositories: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  Toaster: () => null,
}));

const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function renderEditor(props: Partial<React.ComponentProps<typeof RichTextEditor>> = {}) {
  const onChange = vi.fn();
  const result = render(
    <RichTextEditor
      value={props.value ?? ''}
      onChange={onChange}
      onBlur={props.onBlur}
      placeholder={props.placeholder ?? '添加描述...'}
      variant={props.variant ?? 'default'}
    />,
  );
  return { ...result, onChange };
}

describe('RichTextEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the editor surface', async () => {
    renderEditor();
    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')).toBeInTheDocument();
    });
  });

  it('loads top-level data URL images without losing them', async () => {
    const html = `<p>hello</p><img src="${dataUrl}" alt="dot">`;
    const { onChange } = renderEditor({ value: html });

    await waitFor(() => {
      const img = document.querySelector('.ProseMirror img');
      expect(img).toBeInTheDocument();
    });

    const img = document.querySelector('.ProseMirror img') as HTMLImageElement;
    expect(img.src).toBe(dataUrl);

    // 编辑触发 onChange 后，data URL 图片应继续存在
    const editor = document.querySelector('.ProseMirror') as HTMLElement;
    await userEvent.click(editor);
    await userEvent.type(editor, '!');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    const lastCall = onChange.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain(dataUrl);
  });

  // 已知问题：当前 safeSetHTMLContent 只提取顶层 <img>，段落内 data URL 图片在 insertContentAt 时
  // 会经过 ProseMirror DOMParser 并被静默丢弃。启用该测试即开始回归验证。
  it.skip('loads data URL images nested inside paragraphs', async () => {
    const html = `<p>hello</p><p><img src="${dataUrl}" alt="dot"></p>`;
    renderEditor({ value: html });

    await waitFor(() => {
      const img = document.querySelector('.ProseMirror img');
      expect(img).toBeInTheDocument();
    });

    const img = document.querySelector('.ProseMirror img') as HTMLImageElement;
    expect(img.src).toBe(dataUrl);
  });

  // MCP/CLI 创建的 agent 任务详情是纯文本(无 <p> 包裹),不能被丢弃
  it('loads plain-text description (agent-created task)', async () => {
    renderEditor({ value: '收集本季度工作内容与数据,整理成原始素材清单' });

    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')?.textContent)
        .toContain('收集本季度工作内容与数据,整理成原始素材清单');
    });
  });

  it('keeps line breaks in plain-text description as hard breaks', async () => {
    renderEditor({ value: '第一行列出数据\n第二行标注来源' });

    await waitFor(() => {
      expect(document.querySelector('.ProseMirror br')).toBeInTheDocument();
      expect(document.querySelector('.ProseMirror')?.textContent)
        .toContain('第一行列出数据');
      expect(document.querySelector('.ProseMirror')?.textContent)
        .toContain('第二行标注来源');
    });
  });

  it('loads mixed inline text, blocks and escaped special chars', async () => {
    renderEditor({ value: '前置说明 <strong>重点</strong><p>块级段落 & 1 < 2</p>' });

    await waitFor(() => {
      const surface = document.querySelector('.ProseMirror');
      expect(surface?.textContent).toContain('前置说明');
      expect(surface?.textContent).toContain('重点');
      expect(surface?.textContent).toContain('块级段落 & 1 < 2');
      expect(surface?.querySelector('strong')?.textContent).toBe('重点');
    });
  });

  it('opens and closes fullscreen while keeping content', async () => {
    const html = `<p>fullscreen content</p><img src="${dataUrl}">`;
    const { onChange } = renderEditor({ value: html });

    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')).toBeInTheDocument();
    });

    const fullscreenBtn = screen.getByTitle('全屏编辑');
    await userEvent.click(fullscreenBtn);

    await waitFor(() => {
      expect(screen.getByText('全屏编辑 · 描述')).toBeInTheDocument();
    });

    const exitBtn = screen.getByText(/退出全屏/);
    await userEvent.click(exitBtn);

    await waitFor(() => {
      expect(screen.queryByText('全屏编辑 · 描述')).not.toBeInTheDocument();
    });

    // 退出全屏后主编辑器应触发一次 onChange 并保留内容
    await waitFor(() => {
      const lastCall = onChange.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain(dataUrl);
    });
  });

  it('registers a single file drop listener', async () => {
    renderEditor();
    await waitFor(() => {
      expect(mockOnFileDrop).toHaveBeenCalledTimes(1);
    });
    const handler = mockOnFileDrop.mock.calls[0][0];
    expect(typeof handler).toBe('function');
  });
});
