import { useState, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Task } from '../../types/task';
import { useUIStore } from '../../stores/uiStore';
import { StickyNote } from './StickyNote';
import { ExpandedNote } from './ExpandedNote';

interface StickyWallProps {
  tasks: Task[];
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const NOTE_COLORS = [
  { bg: '#FFF9E6', border: '#F0D56C', darkBg: '#2A2410', darkBorder: '#6B5A20' },
  { bg: '#FFF0F0', border: '#E8A0A0', darkBg: '#2A1818', darkBorder: '#6B3030' },
  { bg: '#F0F4FF', border: '#A0B8E8', darkBg: '#181C2A', darkBorder: '#30406B' },
  { bg: '#F0FFF4', border: '#90D5A0', darkBg: '#182A1C', darkBorder: '#306B3A' },
  { bg: '#FFF5F0', border: '#E0B890', darkBg: '#2A1E18', darkBorder: '#6B4830' },
  { bg: '#F8F0FF', border: '#C0A0E0', darkBg: '#22182A', darkBorder: '#58306B' },
];

export function StickyWall({ tasks }: StickyWallProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === 'dark' || theme === 'glass' || theme === 'warm' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const noteData = useMemo(() => tasks.map((task) => {
    const h = hashId(task.id);
    const colorIdx = task.tag_id ? h % NOTE_COLORS.length : h % NOTE_COLORS.length;
    const rotation = ((h % 30) - 15) / 10;
    return { task, colorIdx, rotation };
  }), [tasks]);

  const expandedData = expandedTaskId ? noteData.find((n) => n.task.id === expandedTaskId) : null;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden px-3 py-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {noteData.map(({ task, colorIdx, rotation }) => (
          <StickyNote key={task.id}
            task={task}
            colors={NOTE_COLORS[colorIdx]}
            rotation={rotation}
            isExpanded={expandedTaskId === task.id}
            onExpand={() => setExpandedTaskId(task.id)}
          />
        ))}
      </div>

      {/* Expanded overlay */}
      <AnimatePresence>
        {expandedData && (
          <ExpandedNote
            task={expandedData.task}
            colors={NOTE_COLORS[expandedData.colorIdx]}
            rotation={expandedData.rotation}
            isDark={isDark}
            onClose={() => setExpandedTaskId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
