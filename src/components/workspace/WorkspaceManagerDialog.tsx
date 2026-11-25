import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPlus, Layers, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import '../../i18n';
import { getRepositories } from '../../domain/repositories/current';
import type { WorkspaceInfo } from '../../domain/models/workspace';
import { useWorkspaces, useWorkspaceActions } from '../../hooks/useWorkspaces';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/cn';
import { Portal } from '../shared/Portal';
import { dialogSurface } from './popupSurface';

interface WorkspaceManagerDialogProps {
  open: boolean;
  onClose: () => void;
}

type Panel =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'add'; source: string; suggestedName: string }
  | { kind: 'rename'; workspace: WorkspaceInfo }
  | { kind: 'delete'; workspace: WorkspaceInfo };

const INPUT_CLS = 'h-4 w-4 rounded border-[#D1D5DB] dark:border-white/[0.2] accent-[#7C72F6] cursor-pointer';
const PRIMARY_CLS = 'h-8 px-3 rounded-lg inline-flex items-center gap-1.5 bg-[#7C72F6] text-white text-[13px] font-medium hover:bg-[#6C63E0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const SECONDARY_CLS = 'h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-[13px] text-[#374151] dark:text-[#C4C4CC] border border-[#E5E7EB] dark:border-white/[0.07] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const DANGER_CLS = 'h-8 px-3 rounded-lg text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors';
const TEXT_INPUT_CLS = 'h-8 w-full px-2.5 rounded-lg text-[13px] bg-white dark:bg-white/[0.04] border border-[#E5E7EB] dark:border-white/[0.07] text-[#111827] dark:text-white outline-none focus:ring-1 focus:ring-[#7C72F6] placeholder:text-[#9CA3AF]';

const DB_FILE_FILTER = [{ name: 'SQLite Database', extensions: ['db'] }];

/** 工作区管理:列表、新建、从文件添加、重命名、删除、切换。 */
export function WorkspaceManagerDialog({ open, onClose }: WorkspaceManagerDialogProps) {
  return open ? <ManagerBody onClose={onClose} /> : null;
}

function ManagerBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const isGlass = useUIStore((s) => s.theme) === 'glass';
  const { data: workspaces, isError, refetch } = useWorkspaces();
  const actions = useWorkspaceActions();
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, busy]);

  const list = workspaces ?? [];

  const startAdd = async () => {
    const [source] = await getRepositories().platform.chooseFiles({ multiple: false, filters: DB_FILE_FILTER });
    if (!source) return;
    const file = source.split(/[\\/]/).pop() ?? '';
    const suggestedName = file.replace(/\.[^.]+$/, '') || file;
    setPanel({ kind: 'add', source, suggestedName });
  };

  const submit = async (input: { name: string; switchAfter: boolean }) => {
    const name = input.name.trim();
    if (!name) {
      toast.error(t('workspace.nameRequired'));
      return;
    }
    setBusy(true);
    let ok = false;
    if (panel.kind === 'create') {
      const result = await actions.create(name, input.switchAfter);
      ok = result.ok;
      if (result.ok) toast.success(t('workspace.created'));
      else toast.error(result.message);
    } else if (panel.kind === 'add') {
      const result = await actions.addFromFile(panel.source, name, input.switchAfter);
      ok = result.ok;
      if (result.ok) toast.success(t('workspace.added'));
      else toast.error(result.message);
    } else if (panel.kind === 'rename') {
      const result = await actions.rename(panel.workspace.id, name);
      ok = result.ok;
      if (result.ok) toast.success(t('workspace.renamed'));
      else toast.error(result.message);
    }
    setBusy(false);
    if (ok) setPanel({ kind: 'none' });
  };

  const confirmDelete = async (workspace: WorkspaceInfo) => {
    setBusy(true);
    const result = await actions.remove(workspace.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (result.value) toast.warning(t('workspace.deletedWithLeftover', { detail: result.value }));
    else toast.success(t('workspace.deleted'));
    setPanel({ kind: 'none' });
  };

  const switchTo = (workspace: WorkspaceInfo) => {
    if (!workspace.is_active) void actions.activate(workspace.id);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="workspace-manager-title">
        <div
          className={cn('absolute inset-0', isGlass ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/40')}
          onClick={() => { if (!busy && panel.kind === 'none') onClose(); }}
        />
        <div className={cn('relative w-full max-w-[560px] max-h-[85vh] flex flex-col rounded-2xl', dialogSurface(isGlass, 'shadow-2xl'))}>
          <header className="flex items-start gap-3 p-5 pb-4 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[rgba(124,114,246,0.1)] flex items-center justify-center shrink-0">
              <Layers size={18} className="text-[#7C72F6]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="workspace-manager-title" className="text-[16px] font-bold text-[#111827] dark:text-white">{t('workspace.manageTitle')}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-[#6B7280] dark:text-[#9CA3AF]">{t('workspace.manageHint')}</p>
            </div>
            <button onClick={onClose} disabled={busy} aria-label={t('common.close')} className={SECONDARY_CLS}>✕</button>
          </header>

          <div className="px-5 pb-4 flex flex-wrap gap-2 shrink-0">
            <button onClick={() => setPanel({ kind: 'create' })} disabled={busy} className={PRIMARY_CLS} data-testid="workspace-new">
              <FolderPlus size={14} />
              {t('workspace.new')}
            </button>
            <button onClick={startAdd} disabled={busy} className={SECONDARY_CLS} data-testid="workspace-add-from-file">
              <FolderOpen size={14} />
              {t('workspace.addFromFile')}
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
            {panel.kind === 'create' && (
              <NameForm
                title={t('workspace.new')}
                initialName=""
                allowSwitchAfter
                submitLabel={t('workspace.createAction')}
                busy={busy}
                onSubmit={submit}
                onCancel={() => setPanel({ kind: 'none' })}
              />
            )}
            {panel.kind === 'add' && (
              <NameForm
                key={panel.source}
                title={t('workspace.addFromFileTitle')}
                initialName={panel.suggestedName}
                hint={t('workspace.addHint')}
                allowSwitchAfter
                submitLabel={t('workspace.addAction')}
                busy={busy}
                onSubmit={submit}
                onCancel={() => setPanel({ kind: 'none' })}
              />
            )}

            {isError ? (
              <div className="space-y-3">
                <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]" role="alert">{t('workspace.loadFailed')}</p>
                <button onClick={() => refetch()} className={SECONDARY_CLS}>{t('common.retry')}</button>
              </div>
            ) : !workspaces ? (
              <p className="text-[13px] text-[#6B7280] dark:text-[#9CA3AF]" role="status">{t('common.loading')}</p>
            ) : (
              <ul className="space-y-2" aria-label={t('workspace.manageTitle')}>
                {list.map((workspace) => {
                  const openHere =
                    (panel.kind === 'rename' || panel.kind === 'delete') && panel.workspace.id === workspace.id;
                  return (
                    <li
                      key={workspace.id}
                      className={cn(
                        'rounded-xl border p-3 transition-colors',
                        workspace.is_active
                          ? 'border-[#7C72F6]/40 bg-[rgba(124,114,246,0.06)] dark:bg-[rgba(124,114,246,0.08)]'
                          : 'border-[#E5E7EB] dark:border-white/[0.07]',
                      )}
                      data-testid="workspace-row"
                      data-active={workspace.is_active ? 'true' : 'false'}
                    >
                      {panel.kind === 'rename' && openHere ? (
                        <NameForm
                          title={t('workspace.renameTitle')}
                          initialName={workspace.name}
                          submitLabel={t('common.save')}
                          busy={busy}
                          onSubmit={submit}
                          onCancel={() => setPanel({ kind: 'none' })}
                        />
                      ) : panel.kind === 'delete' && openHere ? (
                        <div className="space-y-2" role="alertdialog" aria-label={t('workspace.confirmDelete')}>
                          <p className="text-[13px] leading-relaxed text-red-700 dark:text-red-300">
                            {t('workspace.deleteConfirm', { name: workspace.name, count: workspace.task_count })}
                          </p>
                          {workspace.is_active && (
                            <p className="text-[12px] text-red-600/80 dark:text-red-400/80">{t('workspace.deleteActiveHint')}</p>
                          )}
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setPanel({ kind: 'none' })} disabled={busy} className={SECONDARY_CLS}>{t('common.cancel')}</button>
                            <button onClick={() => confirmDelete(workspace)} disabled={busy} className={DANGER_CLS} data-testid="workspace-confirm-delete">
                              {t('workspace.confirmDelete')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Layers size={16} className={workspace.is_active ? 'text-[#7C72F6]' : 'text-[#9CA3AF]'} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[14px] font-medium text-[#111827] dark:text-white/90">{workspace.name}</span>
                              {workspace.is_active && (
                                <span className="shrink-0 px-1.5 py-px rounded text-[11px] font-medium bg-[rgba(124,114,246,0.12)] text-[#7C72F6]">
                                  {t('workspace.current')}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
                              {t('workspace.taskCount', { count: workspace.task_count })}
                              {' · '}
                              {workspace.last_activated_at
                                ? t('workspace.lastUsed', { time: workspace.last_activated_at.slice(0, 16) })
                                : t('workspace.neverUsed')}
                            </p>
                          </div>
                          {!workspace.is_active && (
                            <button onClick={() => switchTo(workspace)} disabled={busy} className={SECONDARY_CLS} data-testid="workspace-switch">
                              {t('workspace.switchTo')}
                            </button>
                          )}
                          <button
                            onClick={() => setPanel({ kind: 'rename', workspace })}
                            disabled={busy}
                            aria-label={t('workspace.rename')}
                            title={t('workspace.rename')}
                            className="p-1.5 rounded-lg text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] hover:text-[#111827] dark:hover:text-white disabled:opacity-50 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setPanel({ kind: 'delete', workspace })}
                            disabled={busy || list.length <= 1}
                            aria-label={t('common.delete')}
                            title={list.length <= 1 ? t('workspace.lastOneHint') : t('common.delete')}
                            className="p-1.5 rounded-lg text-[#6B7280] dark:text-[#9CA3AF] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            data-testid="workspace-delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="px-5 pb-4 text-[11px] leading-relaxed text-[#9CA3AF] shrink-0">
            {t('workspace.restartHint')} · {t('workspace.reminderHint')}
          </p>
        </div>
      </div>
    </Portal>
  );
}

function NameForm({
  title,
  initialName,
  hint,
  allowSwitchAfter = false,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialName: string;
  hint?: string;
  allowSwitchAfter?: boolean;
  submitLabel: string;
  busy: boolean;
  onSubmit: (input: { name: string; switchAfter: boolean }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [switchAfter, setSwitchAfter] = useState(true);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ name, switchAfter }); }}
      className="rounded-xl border border-[#E5E7EB] dark:border-white/[0.07] p-3 space-y-3"
      data-testid="workspace-name-form"
    >
      <p className="text-[13px] font-medium text-[#111827] dark:text-white/90">{title}</p>
      {hint && <p className="text-[12px] leading-relaxed text-[#6B7280] dark:text-[#9CA3AF]">{hint}</p>}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('workspace.namePlaceholder')}
        aria-label={t('workspace.namePlaceholder')}
        disabled={busy}
        className={TEXT_INPUT_CLS}
      />
      {allowSwitchAfter && (
        <label className="flex items-center gap-2 text-[12px] text-[#374151] dark:text-[#C4C4CC] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={switchAfter}
            onChange={(e) => setSwitchAfter(e.target.checked)}
            disabled={busy}
            className={INPUT_CLS}
          />
          {t('workspace.switchAfter')}
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY_CLS}>{t('common.cancel')}</button>
        <button type="submit" disabled={busy} className={PRIMARY_CLS} data-testid="workspace-name-submit">{submitLabel}</button>
      </div>
    </form>
  );
}
