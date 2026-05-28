import { useState } from 'react';
import { Download, Database } from 'lucide-react';
import { toast } from 'sonner';
import { getTasks, backupDatabase } from '../lib/db';
import { save } from '@tauri-apps/plugin-dialog';

export function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = async () => {
    const path = await save({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      defaultPath: `todoflow-backup-${new Date().toISOString().split('T')[0]}.db`,
    });
    if (!path) return;
    setBackingUp(true);
    try {
      await backupDatabase(path);
      toast.success('Database backed up successfully');
    } catch (err) {
      toast.error('Failed to backup: ' + (err as string));
    }
    setBackingUp(false);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const tasks = await getTasks({});
      const headers = ['id', 'title', 'description', 'is_completed', 'priority', 'due_date', 'tag_id', 'parent_task_id', 'created_at'];
      const rows = tasks.map((t) =>
        headers.map((h) => {
          const val = (t as unknown as Record<string, unknown>)[h];
          if (val === null || val === undefined) return '';
          return String(val).includes(',') ? `"${val}"` : String(val);
        }).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todoflow-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Data exported as CSV');
    } catch {
      toast.error('Failed to export data');
    }
    setExporting(false);
  };

  return (
    <div className="max-w-lg">
      <h3 className="text-[20px] font-bold text-[#111827] dark:text-white mb-6">Settings</h3>

      {/* Data */}
      <div className="mb-6">
        <h4 className="section-label mb-3">Data</h4>
        <div className="space-y-2">
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors w-full text-[#111827] dark:text-white/90 font-medium"
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Export tasks as CSV'}
          </button>
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-[10px] border border-[#F3F4F6] dark:border-white/[0.07] bg-white dark:bg-[#1e1e32] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors w-full text-[#111827] dark:text-white/90 font-medium"
          >
            <Database size={16} />
            {backingUp ? 'Backing up...' : 'Backup database'}
          </button>
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div>
        <h4 className="section-label mb-3">Keyboard Shortcuts</h4>
        <div className="space-y-1.5">
          {[
            { label: 'Today page', key: '1' },
            { label: 'Calendar page', key: '2' },
            { label: 'Settings page', key: '3' },
            { label: 'Show all shortcuts', key: '?' },
            { label: 'Search tasks', key: 'Ctrl+K' },
            { label: 'Toggle sidebar', key: 'Ctrl+B' },
            { label: 'Close detail panel', key: 'Esc' },
          ].map(({ label, key }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-[13px] text-[#111827] dark:text-white/80">{label}</span>
              <kbd className="text-[11px] px-2 py-0.5 rounded-[4px] bg-[#F3F4F6] dark:bg-white/[0.06] border border-[#E5E7EB] dark:border-white/[0.07] text-[#6B7280] font-medium">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
