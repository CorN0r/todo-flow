import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { getTasks } from '../lib/db';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [exporting, setExporting] = useState(false);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const tasks = await getTasks({});
      const headers = ['id', 'title', 'description', 'is_completed', 'priority', 'due_date', 'list_id', 'parent_task_id', 'created_at'];
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
    } catch (err) {
      toast.error('Failed to export data');
    }
    setExporting(false);
  };

  return (
    <div className="max-w-lg">
      <h3 className="text-lg font-semibold mb-6">Settings</h3>

      {/* Theme */}
      <div className="mb-6">
        <h4 className="text-sm font-medium mb-2">Appearance</h4>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-4 py-2 rounded-lg border text-sm capitalize transition-colors ${
                theme === t
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-accent'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Data */}
      <div className="mb-6">
        <h4 className="text-sm font-medium mb-2">Data</h4>
        <div className="space-y-2">
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border bg-card hover:bg-accent transition-colors w-full"
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Export tasks as CSV'}
          </button>
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div>
        <h4 className="text-sm font-medium mb-2">Keyboard Shortcuts</h4>
        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Navigate to Today</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">1</kbd>
          </div>
          <div className="flex justify-between">
            <span>Navigate to Calendar</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">2</kbd>
          </div>
          <div className="flex justify-between">
            <span>Search tasks</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">Ctrl+K</kbd>
          </div>
          <div className="flex justify-between">
            <span>Toggle sidebar</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">Ctrl+B</kbd>
          </div>
          <div className="flex justify-between">
            <span>Close detail panel</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">Esc</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
