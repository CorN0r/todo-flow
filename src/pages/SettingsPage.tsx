import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '../hooks/useTags';
import { Download, Database, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { getTasks, backupDatabase } from '../lib/db';
import { save } from '@tauri-apps/plugin-dialog';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: tags } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState('');

  const handleCreateTag = () => {
    if (newTagName.trim()) {
      createTag.mutate({ name: newTagName.trim(), color: '#6366f1' });
      setNewTagName('');
      setIsCreatingTag(false);
    }
  };

  const handleUpdateTag = (id: string) => {
    if (editTagName.trim()) {
      updateTag.mutate({ id, name: editTagName.trim() });
    }
    setEditingTagId(null);
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
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border bg-card hover:bg-accent transition-colors w-full"
          >
            <Database size={16} />
            {backingUp ? 'Backing up...' : 'Backup database'}
          </button>
        </div>
      </div>

      {/* Tags management */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Tags</h4>
          <button
            onClick={() => setIsCreatingTag(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-accent transition-colors"
          >
            <Plus size={14} />
            New Tag
          </button>
        </div>

        {isCreatingTag && (
          <div className="flex items-center gap-2 mb-2 p-2 rounded-lg border bg-card">
            <input
              autoFocus
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTag();
                if (e.key === 'Escape') { setNewTagName(''); setIsCreatingTag(false); }
              }}
              placeholder="Tag name..."
              className="flex-1 text-sm px-2 py-1 rounded border bg-background outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={handleCreateTag} disabled={!newTagName.trim()}
              className="p-1 rounded hover:bg-accent disabled:opacity-30">
              <Check size={14} className="text-green-500" />
            </button>
            <button onClick={() => { setNewTagName(''); setIsCreatingTag(false); }}
              className="p-1 rounded hover:bg-accent">
              <X size={14} className="text-muted-foreground" />
            </button>
          </div>
        )}

        <div className="space-y-1">
          {tags?.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent transition-colors group">
              {editingTagId === tag.id ? (
                <>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <input
                    autoFocus
                    value={editTagName}
                    onChange={(e) => setEditTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateTag(tag.id);
                      if (e.key === 'Escape') setEditingTagId(null);
                    }}
                    className="flex-1 text-sm px-2 py-0.5 rounded border bg-background outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button onClick={() => handleUpdateTag(tag.id)} className="p-1 rounded hover:bg-accent">
                    <Check size={14} className="text-green-500" />
                  </button>
                  <button onClick={() => setEditingTagId(null)} className="p-1 rounded hover:bg-accent">
                    <X size={14} className="text-muted-foreground" />
                  </button>
                </>
              ) : (
                <>
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="flex-1 text-sm">{tag.name}</span>
                  <span className="text-xs text-muted-foreground">{tag.task_count ?? 0} tasks</span>
                  <button
                    onClick={() => { setEditingTagId(tag.id); setEditTagName(tag.name); }}
                    className="p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Pencil size={13} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete tag "${tag.name}"? It will be removed from all tasks.`)) {
                        deleteTag.mutate(tag.id);
                      }
                    }}
                    className="p-1 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={13} className="text-red-500" />
                  </button>
                </>
              )}
            </div>
          ))}
          {tags?.length === 0 && !isCreatingTag && (
            <p className="text-sm text-muted-foreground py-2">No tags yet. Create one to categorize tasks.</p>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div>
        <h4 className="text-sm font-medium mb-2">Keyboard Shortcuts</h4>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Today page</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">1</kbd>
          </div>
          <div className="flex justify-between">
            <span>Calendar page</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">2</kbd>
          </div>
          <div className="flex justify-between">
            <span>Settings page</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">3</kbd>
          </div>
          <div className="flex justify-between">
            <span>Show all shortcuts</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border">?</kbd>
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
