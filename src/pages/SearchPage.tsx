import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, Filter, ChevronDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getTasks } from '../lib/db';
import { useTags } from '../hooks/useTags';
import { TaskList } from '../components/tasks/TaskList';
import { EmptyState } from '../components/shared/EmptyState';
import { LoadingSkeleton } from '../components/shared/LoadingSkeleton';
import { Portal } from '../components/shared/Portal';
import { priorityLabels } from '../lib/priority';
import { cn } from '../lib/cn';
import type { Task } from '../types/task';
import type { TagWithCount } from '../types/tag';

type CompletionFilter = 'all' | 'incomplete' | 'completed';

interface Filters {
  query: string;
  tagId: string | null;
  completion: CompletionFilter;
  priority: number | null;
  dateFrom: string;
  dateTo: string;
  myDay: boolean;
}

const PRIORITY_OPTIONS = [
  { value: null, label: '全部优先级' },
  { value: 4, label: '紧急' },
  { value: 3, label: '高' },
  { value: 2, label: '中' },
  { value: 1, label: '低' },
  { value: 0, label: '无优先级' },
];

function flattenTags(tags: TagWithCount[]): TagWithCount[] {
  const result: TagWithCount[] = [];
  function walk(list: TagWithCount[], depth: number) {
    for (const t of list) {
      result.push({ ...t, name: '  '.repeat(depth) + t.name });
      if (t.children) walk(t.children, depth + 1);
    }
  }
  walk(tags, 0);
  return result;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [filters, setFilters] = useState<Filters>({
    query: initialQuery,
    tagId: null,
    completion: 'all',
    priority: null,
    dateFrom: '',
    dateTo: '',
    myDay: false,
  });

  const [results, setResults] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchIdRef = useRef(0);

  const { data: tags } = useTags();
  const flatTags = tags ? flattenTags(tags) : [];
  const selectedTagName = filters.tagId
    ? flatTags.find((t) => t.id === filters.tagId)?.name?.replace(/ /g, '') || '未知标签'
    : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (f: Filters) => {
    const id = ++searchIdRef.current;
    setLoading(true);
    setHasSearched(true);

    const params: Record<string, string> = {};
    if (f.query) params.q = f.query;
    setSearchParams(params);

    try {
      const queryFilters: Parameters<typeof getTasks>[0] = {
        include_children: true,
      };
      if (f.query) queryFilters.search_query = f.query;
      if (f.tagId) queryFilters.tag_id = f.tagId;
      if (f.completion === 'incomplete') queryFilters.is_completed = false;
      if (f.completion === 'completed') queryFilters.is_completed = true;
      if (f.priority !== null) queryFilters.priority = f.priority;
      if (f.dateFrom) queryFilters.due_date_from = f.dateFrom;
      if (f.dateTo) queryFilters.due_date_to = f.dateTo;
      if (f.myDay) queryFilters.my_day_date = new Date().toISOString().slice(0, 10);

      const tasks = await getTasks(queryFilters);
      if (id !== searchIdRef.current) return;
      setResults(tasks);
    } catch (err) {
      if (id !== searchIdRef.current) return;
      console.error('[SearchPage] search failed:', err);
      toast.error(`搜索失败: ${String(err)}`);
      setResults([]);
    }
    if (id === searchIdRef.current) setLoading(false);
  }, [setSearchParams]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(filters), 300);
    return () => clearTimeout(timer);
  }, [filters, doSearch]);

  useEffect(() => {
    if (initialQuery) {
      doSearch({ ...filters, query: initialQuery }); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      query: '',
      tagId: null,
      completion: 'all',
      priority: null,
      dateFrom: '',
      dateTo: '',
      myDay: false,
    });
    setResults([]);
    setHasSearched(false);
  };

  const hasActiveFilters =
    filters.tagId !== null ||
    filters.completion !== 'all' ||
    filters.priority !== null ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.myDay;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-[20px] font-bold text-[#111827] dark:text-white">高级搜索</h1>
        </div>

        {/* Filter panel */}
        <div className="rounded-[10px] bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.06] p-4 mb-4 space-y-3">
          {/* Row 1: Search keyword */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F9FAFB] dark:bg-white/[0.03] border border-[#F3F4F6] dark:border-white/[0.07] transition-colors focus-within:border-[#7C72F6] dark:focus-within:border-[#7C72F6]/60">
            <Search size={16} className="text-[#9CA3AF] flex-shrink-0" />
            <input
              ref={inputRef}
              value={filters.query}
              onChange={(e) => setFilter('query', e.target.value)}
              placeholder="搜索任务标题或描述..."
              className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#9CA3AF]"
            />
            {filters.query && (
              <button onClick={() => setFilter('query', '')} className="p-1 rounded-md hover:bg-[#E5E7EB] dark:hover:bg-white/[0.06] transition-colors">
                <X size={14} className="text-[#9CA3AF]" />
              </button>
            )}
          </div>

          {/* Row 2: Filter controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tag filter */}
            <div className="relative">
              <button
                ref={tagBtnRef}
                onClick={() => { setTagDropdownOpen(!tagDropdownOpen); setPriorityDropdownOpen(false); }}
                className={cn(
                  'h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md border text-[12px] font-medium transition-colors',
                  filters.tagId
                    ? 'bg-[#7C72F6]/[0.08] border-[#7C72F6]/30 text-[#7C72F6]'
                    : 'bg-white dark:bg-[#1e1e32] border-[#E5E7EB] dark:border-white/[0.07] text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06]'
                )}
              >
                <Filter size={12} />
                {selectedTagName || '标签'}
                <ChevronDown size={10} />
              </button>
              {tagDropdownOpen && (
                <Portal>
                  <div className="fixed inset-0 z-40" onClick={() => setTagDropdownOpen(false)} />
                  <div
                    className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[180px] max-h-[260px] overflow-y-auto"
                    style={{
                      top: (tagBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                      left: tagBtnRef.current?.getBoundingClientRect().left ?? 0,
                    }}
                  >
                    <button
                      onClick={() => { setFilter('tagId', null); setTagDropdownOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-[13px] transition-colors',
                        !filters.tagId ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]'
                      )}
                    >
                      全部标签
                    </button>
                    {flatTags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setFilter('tagId', t.id); setTagDropdownOpen(false); }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-[13px] transition-colors',
                          filters.tagId === t.id ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]'
                        )}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          {t.name.replace(/ /g, '')}
                        </span>
                      </button>
                    ))}
                  </div>
                </Portal>
              )}
            </div>

            {/* Completion filter */}
            <div className="flex items-center rounded-md border border-[#E5E7EB] dark:border-white/[0.07] overflow-hidden">
              {([
                ['all', '全部'],
                ['incomplete', '未完成'],
                ['completed', '已完成'],
              ] as [CompletionFilter, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter('completion', val)}
                  className={cn(
                    'h-[30px] px-[10px] text-[12px] font-medium transition-colors border-r border-[#E5E7EB] dark:border-white/[0.07] last:border-r-0',
                    filters.completion === val
                      ? 'bg-[#7C72F6] text-white'
                      : 'bg-white dark:bg-[#1e1e32] text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06]'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Priority filter */}
            <div className="relative">
              <button
                ref={priorityBtnRef}
                onClick={() => { setPriorityDropdownOpen(!priorityDropdownOpen); setTagDropdownOpen(false); }}
                className={cn(
                  'h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md border text-[12px] font-medium transition-colors',
                  filters.priority !== null
                    ? 'bg-[#7C72F6]/[0.08] border-[#7C72F6]/30 text-[#7C72F6]'
                    : 'bg-white dark:bg-[#1e1e32] border-[#E5E7EB] dark:border-white/[0.07] text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06]'
                )}
              >
                <Filter size={12} />
                {filters.priority !== null ? priorityLabels[filters.priority] : '优先级'}
                <ChevronDown size={10} />
              </button>
              {priorityDropdownOpen && (
                <Portal>
                  <div className="fixed inset-0 z-40" onClick={() => setPriorityDropdownOpen(false)} />
                  <div
                    className="fixed z-50 bg-white dark:bg-[#1e1e32] border border-[#F3F4F6] dark:border-white/[0.07] rounded-xl shadow-xl py-1 min-w-[140px]"
                    style={{
                      top: (priorityBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                      left: priorityBtnRef.current?.getBoundingClientRect().left ?? 0,
                    }}
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <button
                        key={String(opt.value)}
                        onClick={() => { setFilter('priority', opt.value); setPriorityDropdownOpen(false); }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-[13px] transition-colors',
                          filters.priority === opt.value ? 'bg-[#7C72F6]/[0.08] text-[#7C72F6] font-medium' : 'text-[#111827] dark:text-white/90 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.04]'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Portal>
              )}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilter('dateFrom', e.target.value)}
                className={cn(
                  'h-[30px] w-[130px] px-[10px] rounded-md border text-[12px] outline-none transition-colors focus:border-[#7C72F6]',
                  'bg-white dark:bg-[#1e1e32] border-[#E5E7EB] dark:border-white/[0.07] text-[#374151] dark:text-white/80',
                  '[color-scheme:light] dark:[color-scheme:dark]'
                )}
                placeholder="开始日期"
              />
              <span className="text-[12px] text-[#9CA3AF]">—</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilter('dateTo', e.target.value)}
                className={cn(
                  'h-[30px] w-[130px] px-[10px] rounded-md border text-[12px] outline-none transition-colors focus:border-[#7C72F6]',
                  'bg-white dark:bg-[#1e1e32] border-[#E5E7EB] dark:border-white/[0.07] text-[#374151] dark:text-white/80',
                  '[color-scheme:light] dark:[color-scheme:dark]'
                )}
                placeholder="结束日期"
              />
            </div>

            {/* My Day toggle */}
            <button
              onClick={() => setFilter('myDay', !filters.myDay)}
              className={cn(
                'h-[30px] inline-flex items-center gap-1.5 px-[10px] rounded-md border text-[12px] font-medium transition-colors',
                filters.myDay
                  ? 'bg-[#7C72F6]/[0.08] border-[#7C72F6]/30 text-[#7C72F6]'
                  : 'bg-white dark:bg-[#1e1e32] border-[#E5E7EB] dark:border-white/[0.07] text-[#374151] dark:text-white/80 hover:bg-[#F9FAFB] dark:hover:bg-white/[0.06]'
              )}
            >
              我的一天
            </button>

            {/* Reset */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="h-[30px] inline-flex items-center gap-1 px-[10px] rounded-md text-[12px] font-medium text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors"
              >
                <RotateCcw size={12} />
                重置
              </button>
            )}
          </div>
        </div>

        {/* Results summary */}
        {hasSearched && !loading && (
          <p className="text-[12px] text-[#6B7280] mb-3">
            {filters.query || hasActiveFilters ? (
              <>找到 {results.length} 条结果</>
            ) : null}
          </p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <LoadingSkeleton count={5} />
        ) : hasSearched && results.length > 0 ? (
          <TaskList tasks={results} />
        ) : hasSearched && (filters.query || hasActiveFilters) ? (
          <EmptyState
            icon={<Search size={40} />}
            title="未找到匹配任务"
            description="尝试调整筛选条件或更换关键词"
          />
        ) : !hasSearched ? (
          <div className="max-w-2xl mx-auto pt-8">
            <EmptyState
              icon={<Search size={40} />}
              title="高级搜索"
              description="使用上方筛选条件搜索任务，支持按关键词、标签、优先级、日期范围等组合筛选"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
