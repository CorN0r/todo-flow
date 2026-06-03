import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Task } from '../../types/task';
import { TaskCard } from './TaskCard';

interface VirtualTaskListProps {
  tasks: Task[];
  estimateSize?: number;
}

export function VirtualTaskList({ tasks, estimateSize = 66 }: VirtualTaskListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const task = tasks[virtualItem.index];
          return (
            <div
              key={task.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="pb-[6px]"><TaskCard task={task} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
