import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseBackup, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import '../../i18n';
import { getRepositories } from '../../domain/repositories/current';
import type { BackupPreview, BackupTaskPreview } from '../../domain/models/workspace';
import { workspaceErrorMessage } from '../../hooks/useWorkspaces';
import { useUIStore } from '../../stores/uiStore';
import { cn } from '../../lib/cn';
import { Portal } from '../shared/Portal';
import { dialogSurface } from './popupSurface';

interface RecoverFromBackupDialogProps {
  open: boolean;
  onClose: () => void;
}

type Stage =
  | { kind: 'choose' }
  | { kind: 'loading'; source: string }
  | { kind: 'preview'; source: string; preview: BackupPreview };

const INPUT_CLS = 'h-4 w-4 rounded border-[#D1D5DB] dark:border-white/[0.2] accent-[#7C72F6] cursor-pointer';
const PRIMARY_CLS = 'h-8 px-3 rounded-lg bg-[#7C72F6] text-white text-[13px] font-medium hover:bg-[#6C63E0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const SECONDARY_CLS = 'h-8 px-3 rounded-lg text-[13px] text-[#374151] dark:text-[#C4C4CC] border border-[#E5E7EB] dark:border-white/[0.07] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04] transition-colors';

/** 从备份找回:先预览、再勾选。默认只勾选当前库中没有的任务。 */
export function RecoverFromBackupDialog({ open, onClose }: RecoverFromBackupDialogProps) {
  return open ? <RecoverBody onClose={onClose} /> : null;
}

function RecoverBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const isGlass = useUIStore((s) => s.theme) === 'glass';
  const [stage, setStage] = useState<Stage>({ kind: 'choose' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeReviews, setIncludeReviews] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, busy]);

  const chooseFile = async () => {
    const [source] = await getRepositories().platform.chooseFiles({
      multiple: false,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (!source) return;
    setStage({ kind: 'loading', source });
    try {
      const preview = await getRepositories().settings.inspectBackup(source);
      // 默认只勾选当前库中没有的任务;已存在的不动
      setSelected(new Set(preview.tasks.filter((task) => !task.exists_locally).map((task) => task.id)));
      setIncludeReviews(false);
      setStage({ kind: 'preview', source, preview });
    } catch (err) {
      toast.error(t('recover.inspectFailed', { message: workspaceErrorMessage(err) }));
      setStage({ kind: 'choose' });
    }
  };

  const recover = async () => {
    if (stage.kind !== 'preview' || selected.size === 0) return;
    setBusy(true);
    try {
      const counts = await getRepositories().settings.recoverFromBackup(stage.source, [...selected], includeReviews);
      let message = t('recover.result', { recovered: counts.recovered, replaced: counts.replaced });
      if (counts.reviews_restored > 0) message += t('recover.resultReviews', { count: counts.reviews_restored });
      toast.success(message);
      onClose();
    } catch (err) {
      toast.error(t('recover.failed', { message: workspaceErrorMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 父任务一行、子任务缩进跟在后面
  const tasks = stage.kind === 'preview' ? stage.preview.tasks : [];
  const ids = new Set(tasks.map((task) => task.id));
  const roots = tasks.filter((task) => !task.parent_task_id || !ids.has(task.parent_task_id));
  const childrenOf = (id: string) => tasks.filter((task) => task.parent_task_id === id);
  const missingCount = tasks.filter((task) => !task.exists_locally).length;
  const replacing = tasks.filter((task) => task.exists_locally && selected.has(task.id)).length;

  const row = (task: BackupTaskPreview, depth: number) => (
    <TaskRow
      key={task.id}
      task={task}
      depth={depth}
      checked={selected.has(task.id)}
      onToggle={() => toggle(task.id)}
    />
  );

  return (
    <Portal>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="recover-dialog-title">
        <div
          className={cn('absolute inset-0', isGlass ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/40')}
          onClick={() => { if (!busy) onClose(); }}
        />
        <div className={cn('relative w-full max-w-[560px] max-h-[85vh] flex flex-col rounded-2xl', dialogSurface(isGlass, 'shadow-2xl'))}>
          <div className="flex items-start gap-3 p-5 pb-4 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[rgba(124,114,246,0.1)] flex items-center justify-center shrink-0">
              <DatabaseBackup size={18} className="text-[#7C72F6]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="recover-dialog-title" className="text-[16px] font-bold text-[#111827] dark:text-white">{t('recover.title')}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-[#6B7280] dark:text-[#9CA3AF]">{t('recover.chooseHint')}</p>
            </div>
            <button onClick={onClose} disabled={busy} aria-label={t('common.close')} className={SECONDARY_CLS}>✕</button>
          </div>

          {stage.kind === 'choose' && (
            <div className="px-5 pb-5 space-y-3">
              <button onClick={chooseFile} className={PRIMARY_CLS} data-testid="recover-choose-file">
                {t('recover.chooseFile')}
              </button>
              <p className="text-[12px] text-[#9CA3AF]">{t('recover.wholeLibrary')}</p>
            </div>
          )}

          {stage.kind === 'loading' && (
            <p className="px-5 pb-5 text-[13px] text-[#6B7280] dark:text-[#9CA3AF]" role="status">{t('recover.loading')}</p>
          )}

          {stage.kind === 'preview' && (
            <>
              <div className="px-5 shrink-0 space-y-3">
                <p className="text-[13px] text-[#111827] dark:text-white/90" role="status">
                  {t('recover.summary', { total: tasks.length, missing: missingCount })}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelected(new Set(tasks.filter((task) => !task.exists_locally).map((task) => task.id)))} className={SECONDARY_CLS}>
                    {t('recover.selectMissing')}
                  </button>
                  <button onClick={() => setSelected(new Set())} className={SECONDARY_CLS}>{t('recover.clearSelection')}</button>
                  <span className="ml-auto text-[12px] text-[#6B7280] dark:text-[#9CA3AF]" data-testid="recover-selected-count">
                    {t('recover.selected', { count: selected.size })}
                  </span>
                </div>
              </div>

              <ul className="mx-5 mb-3 flex-1 min-h-0 overflow-y-auto rounded-xl border border-[#E5E7EB] dark:border-white/[0.07]" aria-label={t('recover.title')}>
                {roots.map((task) => (
                  <li key={task.id}>
                    {row(task, 0)}
                    {childrenOf(task.id).map((child) => row(child, 1))}
                  </li>
                ))}
              </ul>

              <div className="px-5 pb-5 shrink-0 space-y-3 border-t border-[#E5E7EB] dark:border-white/[0.07] pt-4">
                <p className="text-[11px] leading-relaxed text-[#9CA3AF]">
                  {t('recover.childrenHint')}
                  {replacing > 0 && <span className="text-amber-600 dark:text-amber-400"> {t('recover.replaceHint')}</span>}
                </p>
                {stage.preview.has_reviews && (
                  <label className="flex items-center gap-2 text-[13px] text-[#374151] dark:text-[#C4C4CC] cursor-pointer select-none">
                    <input type="checkbox" checked={includeReviews} onChange={(e) => setIncludeReviews(e.target.checked)} className={INPUT_CLS} />
                    {t('recover.includeReviews')}
                  </label>
                )}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-[#9CA3AF]">{t('recover.scopeHint')}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={onClose} disabled={busy} className={SECONDARY_CLS}>{t('common.cancel')}</button>
                    <button
                      onClick={recover}
                      disabled={busy || selected.size === 0}
                      className={PRIMARY_CLS}
                      data-testid="recover-submit"
                    >
                      {busy ? t('recover.recovering') : t('recover.recoverAction')}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

function TaskRow({
  task,
  depth,
  checked,
  onToggle,
}: {
  task: BackupTaskPreview;
  depth: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <label
      className={cn(
        'flex items-start gap-2.5 px-3 py-2 border-b border-[#E5E7EB] dark:border-white/[0.07] last:border-b-0 cursor-pointer hover:bg-[#F9FAFB] dark:hover:bg-white/[0.03] transition-colors',
        depth > 0 && 'bg-[#FAFAFC] dark:bg-black/[0.12]',
      )}
      style={{ paddingLeft: depth > 0 ? 36 : undefined }}
      data-testid="recover-task-row"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className={cn(INPUT_CLS, 'mt-0.5')}
        aria-label={task.title}
      />
      <span className="flex-1 min-w-0">
        <span className={cn('block text-[13px] leading-snug break-words', task.is_completed && 'line-through text-[#9CA3AF]', !task.is_completed && 'text-[#111827] dark:text-white/90')}>
          {task.title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
          {task.source === 'agent' && <Sparkles size={11} className="text-[#7C72F6]" aria-label="Agent" />}
          <span className={task.exists_locally ? 'text-[#9CA3AF]' : 'text-[#7C72F6]'}>
            {task.exists_locally ? t('recover.exists') : t('recover.missing')}
          </span>
        </span>
      </span>
    </label>
  );
}
