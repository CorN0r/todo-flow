import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import i18n from '../../i18n';
import { AttachmentZone } from '../../components/attachments/AttachmentZone';
import { renderWithProviders } from '../test-utils';
import type { Attachment } from '../../types/attachment';

const state = vi.hoisted(() => ({
  attachments: [] as Attachment[],
}));

// 路径由后端给出:文件不在磁盘上时为 null
vi.mock('../../lib/db', () => ({
  getAttachmentFilePath: vi.fn(async () => null),
}));

vi.mock('../../hooks/useAttachments', () => ({
  useAttachments: () => ({ data: state.attachments }),
  useUploadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAttachment: () => ({ mutate: vi.fn() }),
}));

const attachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: 'att-1',
  task_id: 'task-1',
  original_name: '截图.png',
  storage_name: 'a.png',
  mime_type: 'image/png',
  file_size: 12,
  thumbnail_name: null,
  created_at: '2026-11-24 10:00:00',
  ...overrides,
});

describe('AttachmentZone 文件缺失', () => {
  afterEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('记录还在、文件不在时显示"文件缺失",不呈现为可预览的图片', async () => {
    state.attachments = [attachment()];
    renderWithProviders(<AttachmentZone taskId="task-1" />);

    const missing = await screen.findByTestId('attachment-missing');
    expect(missing).toHaveTextContent('文件缺失');
    expect(missing).toHaveAttribute('title', '截图.png');
    expect(document.querySelector('img')).toBeNull();
    // 仍然可以删除这条记录
    expect(missing.querySelector('button')).not.toBeNull();
  });

  it('非图片附件同样显示缺失', async () => {
    state.attachments = [attachment({ id: 'att-2', original_name: '说明.pdf', mime_type: 'application/pdf' })];
    renderWithProviders(<AttachmentZone taskId="task-1" />);

    expect(await screen.findByTestId('attachment-missing')).toHaveTextContent('文件缺失');
  });

  it('切换到英文后文案跟着变', async () => {
    await i18n.changeLanguage('en-US');
    state.attachments = [attachment()];
    renderWithProviders(<AttachmentZone taskId="task-1" />);

    expect(await screen.findByTestId('attachment-missing')).toHaveTextContent('File missing');
  });
});
