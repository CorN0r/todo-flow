import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Download, Layers, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { getRepositories } from '../../domain/repositories/current';
import { clearStateEventsRange, getHistoryRetention, setHistoryRetention } from '../../lib/db';
import { todayISO } from '../../lib/date';
import { RecoverFromBackupDialog } from '../workspace/RecoverFromBackupDialog';
import { WorkspaceManagerDialog } from '../workspace/WorkspaceManagerDialog';
import { SettingsCard, SettingsRow, SettingsSectionHeader, SettingsToggle } from './SettingsPrimitives';

const ACTION_BTN =
  'text-[12px] px-3 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-white/[0.10] bg-[#F9FAFB] dark:bg-white/[0.04] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.08] text-[#111827] dark:text-white/90 font-medium transition-colors disabled:opacity-50';

export function DataSettingsPanel() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const workspacesAvailable = getRepositories().platform.kind === 'desktop';

  // ---------- 任务历史与回顾 ----------
  const [retentionEnabled, setRetentionEnabled] = useState<boolean | null>(null);
  const [clearingEvents, setClearingEvents] = useState(false);
  const [cleanupStart, setCleanupStart] = useState('');
  const [cleanupEnd, setCleanupEnd] = useState('');

  useEffect(() => {
    void getHistoryRetention().then(setRetentionEnabled).catch(() => setRetentionEnabled(null));
  }, []);

  const handleBackup = async () => {
    const path = await getRepositories().platform.chooseSavePath({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      defaultPath: `todoflow-backup-${new Date().toISOString().split('T')[0]}.db`,
    });
    if (!path) return;
    setBackingUp(true);
    try {
      await getRepositories().settings.backupDatabase(path);
      toast.success('数据库备份成功');
    } catch (err) {
      toast.error('备份失败: ' + (err as string));
    }
    setBackingUp(false);
  };

  const handleExportCSV = async () => {
    const path = await getRepositories().platform.chooseSavePath({
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      defaultPath: `todoflow-export-${new Date().toISOString().split('T')[0]}.csv`,
    });
    if (!path) return;
    setExporting(true);
    try {
      const tasks = await getRepositories().tasks.list({ include_children: true });
      const headers = ['id', 'title', 'description', 'is_completed', 'is_archived', 'is_suspended', 'is_abandoned', 'priority', 'due_date', 'reminder', 'recurrence', 'tag_id', 'parent_task_id', 'sort_order', 'my_day_date', 'created_at', 'updated_at'];
      const rows = tasks.map((task) =>
        headers.map((h) => {
          const val = (task as unknown as Record<string, unknown>)[h];
          if (val === null || val === undefined) return '';
          return String(val).includes(',') ? `"${val}"` : String(val);
        }).join(','),
      );
      const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      await getRepositories().settings.exportCsv(path, csv);
      toast.success('数据已导出为 CSV');
    } catch {
      toast.error('导出失败');
    }
    setExporting(false);
  };

  const handleRetentionToggle = async (enabled: boolean) => {
    const prev = retentionEnabled;
    setRetentionEnabled(enabled);
    try {
      await setHistoryRetention(enabled);
      toast.success(
        enabled
          ? '已开启状态历史留存:完成、重开、挂起等本机操作会自动留痕'
          : '已关闭后续留存:任务与手写记录照常使用,关闭区间将在回顾中标为资料缺口',
      );
    } catch (err) {
      setRetentionEnabled(prev);
      toast.error('设置失败: ' + (err as string));
    }
  };

  const handleCleanupEvents = async () => {
    if (!cleanupStart || !cleanupEnd || cleanupStart > cleanupEnd) {
      toast.error('请选择正确的清理日期区间');
      return;
    }
    setClearingEvents(true);
    try {
      const removed = await clearStateEventsRange(cleanupStart, cleanupEnd);
      toast.success(`已清理 ${removed} 条状态事件;该区间在回顾中会标为资料缺口`);
      setCleanupStart('');
      setCleanupEnd('');
    } catch (err) {
      toast.error('清理失败: ' + (err as string));
    }
    setClearingEvents(false);
  };

  return (
    <div className="space-y-6">
      <section>
        <SettingsSectionHeader
          title="工作区与数据备份"
          description="所有数据保存在本地 SQLite 数据库中，可随时备份、找回或导出"
        />
        <SettingsCard divided>
          {workspacesAvailable && (
            <SettingsRow
              icon={<Layers size={16} />}
              title={t('settings.manageWorkspaces')}
              description="创建、切换或管理相互独立的本地工作区"
              control={
                <button
                  type="button"
                  onClick={() => setWorkspacesOpen(true)}
                  data-testid="settings-manage-workspaces"
                  className={ACTION_BTN}
                >
                  {t('settings.manageWorkspaces')}
                </button>
              }
            />
          )}
          <SettingsRow
            icon={<Database size={16} />}
            title="备份数据库"
            description="将当前工作区的完整数据库保存为 .db 备份文件"
            control={
              <button
                type="button"
                onClick={handleBackup}
                disabled={backingUp}
                className={ACTION_BTN}
              >
                {backingUp ? '备份中...' : '备份数据库'}
              </button>
            }
          />
          <SettingsRow
            icon={<Upload size={16} />}
            title={t('recover.action')}
            description="从已有备份文件预览并按需找回任务、标签与进展记录"
            control={
              <button
                type="button"
                onClick={() => setRecoverOpen(true)}
                data-testid="settings-recover"
                className={ACTION_BTN}
              >
                {t('recover.action')}
              </button>
            }
          />
          <SettingsRow
            icon={<Download size={16} />}
            title="导出任务为 CSV"
            description="将全部任务及子任务导出为通用表格文件"
            control={
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={exporting}
                className={ACTION_BTN}
              >
                {exporting ? '导出中...' : '导出 CSV'}
              </button>
            }
          />
        </SettingsCard>

        <RecoverFromBackupDialog open={recoverOpen} onClose={() => setRecoverOpen(false)} />
        {workspacesAvailable && (
          <WorkspaceManagerDialog open={workspacesOpen} onClose={() => setWorkspacesOpen(false)} />
        )}
      </section>

      <section>
        <SettingsSectionHeader
          title="任务历史与回顾"
          description="控制状态转换事实的留存策略，用于日/周回顾统计"
        />
        <SettingsCard divided>
          <SettingsRow
            title="保留本机任务状态历史"
            description="自动记录本机真实发生的完成、重开、挂起、放弃等转换,供日/周回顾使用;关闭后任务与手写记录照常,仅停止记录新事件。"
            control={
              <SettingsToggle
                checked={retentionEnabled ?? true}
                disabled={retentionEnabled === null}
                onChange={handleRetentionToggle}
                ariaLabel="保留本机任务状态历史"
              />
            }
          />
          <div className="px-4 py-3.5 space-y-2.5">
            <div>
              <div className="text-[13px] font-medium text-[#111827] dark:text-white/90">清理事实历史</div>
              <p className="text-[11.5px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5">
                删除某段日期的状态事件；清理后该段在回顾中标为资料缺口，不会误报为没有活动。手写记录不受影响。
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                aria-label="清理开始日期"
                value={cleanupStart}
                max={todayISO()}
                onChange={(e) => setCleanupStart(e.target.value)}
                className="text-[12px] px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-white/[0.10] bg-transparent text-[#111827] dark:text-white/90 outline-none focus:border-[#7C72F6]"
              />
              <span className="text-[12px] text-[#9CA3AF]">至</span>
              <input
                type="date"
                aria-label="清理结束日期"
                value={cleanupEnd}
                max={todayISO()}
                onChange={(e) => setCleanupEnd(e.target.value)}
                className="text-[12px] px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-white/[0.10] bg-transparent text-[#111827] dark:text-white/90 outline-none focus:border-[#7C72F6]"
              />
              <button
                type="button"
                onClick={handleCleanupEvents}
                disabled={clearingEvents || !cleanupStart || !cleanupEnd}
                className="text-[12px] px-3 py-1.5 rounded-lg text-[#EF4444] border border-[#EF4444]/40 hover:bg-[#FEF2F2] dark:hover:bg-red-950/30 disabled:opacity-40 font-medium transition-colors"
              >
                {clearingEvents ? '清理中...' : '清理该区间'}
              </button>
            </div>
          </div>
        </SettingsCard>
      </section>
    </div>
  );
}
