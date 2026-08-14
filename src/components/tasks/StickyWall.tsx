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
  { bg: '#FFF3C4', border: '#E8C460', darkBg: '#4A4028', darkBorder: '#8A7A50' },
  { bg: '#FECACA', border: '#E87560', darkBg: '#4A3030', darkBorder: '#8A4040' },
  { bg: '#C7D8F0', border: '#7090D0', darkBg: '#283048', darkBorder: '#506080' },
  { bg: '#B8E8C8', border: '#60C070', darkBg: '#284830', darkBorder: '#507050' },
  { bg: '#FDE8C8', border: '#E0A050', darkBg: '#4A3828', darkBorder: '#8A6040' },
  { bg: '#E0C8F8', border: '#A070D0', darkBg: '#382848', darkBorder: '#605070' },
];

export function StickyWall({ tasks }: StickyWallProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === 'dark' || theme === 'glass' || theme === 'warm' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const noteData = useMemo(() => tasks.map((task) => {
    const h = hashId(task.id);
    const colorIdx = h % NOTE_COLORS.length;
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
            colorIdx={expandedData.colorIdx}
            rotation={expandedData.rotation}
            isDark={isDark}
            onClose={() => setExpandedTaskId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
