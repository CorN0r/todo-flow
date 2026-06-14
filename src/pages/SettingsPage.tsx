import { useState, useEffect } from 'react';
import { Upload, Download, Database, PanelBottom } from 'lucide-react';
import { toast } from 'sonner';
import { getTasks, backupDatabase, exportCsv, importDatabase, getSetting, setSetting } from '../lib/db';
import { save, open } from '@tauri-apps/plugin-dialog';
import { ShortcutEditor } from '../components/shared/ShortcutEditor';

export function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(true);

  useEffect(() => {
    getSetting('widget_enabled').then((v) => {
      setWidgetEnabled(v !== '0');
    }).catch(() => {});
  }, []);

  const toggleWidget = (enabled: boolean) => {
    setWidgetEnabled(enabled);
    setSetting('widget_enabled', enabled ? '1' : '0');
  };

  const handleBackup = async () => {
    const path = await save({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      defaultPath: `todoflow-backup-${new Date().toISOString().split('T')[0]}.db`,
    });
    if (!path) return;
    setBackingUp(true);
    try {
      await backupDatabase(path);
      toast.success('数据库备份成功');
    } catch (err) {
      toast.error('备份失败: ' + (err as string));
    }
    setBackingUp(false);
  };

  const handleExportCSV = async () => {
    const path = await save({
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      defaultPath: `todoflow-export-${new Date().toISOString().split('T')[0]}.csv`,
    });
    if (!path) return;
    setExporting(true);
    try {
      const tasks = await getTasks({ include_children: true });
      const headers = ['id', 'title', 'description', 'is_completed', 'is_archived', 'is_suspended', 'is_abandoned', 'priority', 'due_date', 'reminder', 'recurrence', 'tag_id', 'parent_task_id', 'sort_order', 'my_day_date', 'created_at', 'updated_at'];
      const rows = tasks.map((t) =>
        headers.map((h) => {
          const val = (t as unknown as Record<string, unknown>)[h];
          if (val === null || val === undefined) return '';
          return String(val).includes(',') ? `"${val}"` : String(val);
        }).join(',')
      );
      const csv = '﻿' + [headers.join(','), ...rows].join('\n');
      await exportCsv(path, csv);
      toast.success('数据已导出为 CSV');
    } catch {
      toast.error('导出失败');
    }
    setExporting(false);
  };

  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    const selected = await open({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      multiple: false,
    });
    if (!selected) return;
    setImporting(true);
    try {
      const result = await importDatabase(selected as string);
      toast.success(result);
    } catch (err) {
      toast.error('导入失败: ' + (err as string));
    }
    setImporting(false);
  };

  return (
    <div className="max-w-lg">
      <h3 className="text-[20px] font-bold text-[#111827] dark:text-white mb-6">设置</h3>

      {/* Data */}
      <div className="mb-6">
        <h4 className="section-label mb-3">数据</h4>
        <div className="space-y-2">
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors w-full text-[#111827] dark:text-white/90 font-medium"
          >
            <Download size={16} />
            {exporting ? '导出中...' : '导出任务为 CSV'}
          </button>
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors w-full text-[#111827] dark:text-white/90 font-medium"
          >
            <Database size={16} />
            {backingUp ? '备份中...' : '备份数据库'}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors w-full text-[#111827] dark:text-white/90 font-medium"
          >
            <Upload size={16} />
            {importing ? '导入中...' : '导入数据库'}
          </button>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="section-label mb-3">悬浮窗</h4>
        <div className="flex items-center justify-between px-4 py-3 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32]">
          <div className="flex items-center gap-3">
            <PanelBottom size={16} className="text-[#6B7280]" />
            <span className="text-[13px] text-[#111827] dark:text-white/90 font-medium">显示悬浮窗</span>
          </div>
          <button onClick={() => toggleWidget(!widgetEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors ${widgetEnabled ? 'bg-[#7C72F6]' : 'bg-[#D1D5DB] dark:bg-white/[0.15]'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${widgetEnabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div>
        <h4 className="section-label mb-3">快捷键</h4>
        <ShortcutEditor />
      </div>
    </div>
  );
}
