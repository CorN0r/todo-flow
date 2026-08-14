import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useSpring, useTransform } from 'motion/react';
import { Check, Maximize2, Minus, Pin, PinOff, X } from 'lucide-react';
import type { Task } from '../../types/task';
import type { TagWithCount } from '../../types/tag';
import type { NoteStyle } from '../../types/note';
import { useTags } from '../../hooks/useTags';
import { useUpdateTask } from '../../hooks/useTasks';
import { PRIORITY_HEX } from '../../lib/priority';
import { formatCountdown } from '../../lib/noteCountdown';
import { cn } from '../../lib/cn';

interface NoteCardProps {
  task: Task;
  children: Task[];
  style: NoteStyle;
  alwaysOnTop: boolean;
  collapsed: boolean;
  onToggleAlwaysOnTop: () => void;
  onToggleCollapsed: () => void;
  onClose: () => void;
}

// 便签是独立透明 WebView,皮肤自带底色、不跟随应用主题,全部用显式 hex/rgba。
interface NoteSkin {
  wrapperClass: string;
  cardClass: string;
  cardStyle?: CSSProperties;
  contentClass: string;
  titleClass: string;
  subtextClass: string;
  subtextDoneClass: string;
  metaClass: string;
  chipClass: string;
  actionBtnClass: string;
  actionIconClass: string;
  pinActiveClass: string;
  checkboxDoneClass: string;
  checkboxIdleClass: string;
  countdownColor: string;
  countdownOverdueColor: string;
  ringTrack: string;
  ringText: string;
  ringGlow: boolean;
}

const PAPER_NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E";

// 外层留白:hover 浮起 scale 1.02 + 柔和阴影晕开不越出窗口(透明窗口边界即裁剪边界,
// 32px 以上模糊的阴影需要 14px 留白才能完整落在窗口内)
const SKINS: Record<NoteStyle, NoteSkin> = {
  minimal: {
    wrapperClass: 'w-[280px] box-border p-[14px]',
    cardClass: 'w-full rounded-[12px] border border-[#E8E8ED] bg-[#FFFFFF] shadow-[0_2px_8px_rgba(0,0,0,0.05),0_12px_28px_rgba(0,0,0,0.07)] overflow-hidden transition-[scale] duration-200 ease-out hover:scale-[1.02]',
    contentClass: 'pl-[14px] pr-3 py-3',
    titleClass: 'text-[#1D1D1F]',
    subtextClass: 'text-[#1D1D1F]',
    subtextDoneClass: 'text-[#8E8E93]',
    metaClass: 'text-[#8E8E93]',
    chipClass: 'bg-transparent border border-[#E8E8ED] text-[#6E6E73]',
    actionBtnClass: 'hover:bg-[#F2F2F7]',
    actionIconClass: 'text-[#8E8E93]',
    pinActiveClass: 'text-[#7C72F6]',
    checkboxDoneClass: 'bg-[#7C72F6] border-[#7C72F6] text-white',
    checkboxIdleClass: 'border-[#D1D5DB] hover:border-[#7C72F6]',
    countdownColor: '#D97706',
    countdownOverdueColor: '#EF4444',
    ringTrack: '#E5E5EA',
    ringText: '#1D1D1F',
    ringGlow: false,
  },
  glass: {
    wrapperClass: 'w-[280px] box-border p-[14px]',
    // 阴影收进 cardStyle:与内高光 inset 共存于同一个 boxShadow,避免 class/style 打架
    cardClass: 'w-full rounded-[20px] overflow-hidden transition-[scale] duration-200 ease-out hover:scale-[1.02]',
    cardStyle: {
      background: 'rgba(24,24,38,0.62)',
      backdropFilter: 'blur(20px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow:
        '0 4px 16px rgba(0,0,0,0.22), 0 16px 40px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.07)',
    },
    contentClass: 'pl-[14px] pr-3 py-3',
    titleClass: 'text-[#FFFFFF]',
    subtextClass: 'text-[rgba(255,255,255,0.7)]',
    subtextDoneClass: 'text-[rgba(255,255,255,0.45)]',
    metaClass: 'text-[rgba(255,255,255,0.5)]',
    chipClass: 'bg-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.75)]',
    actionBtnClass: 'hover:bg-[rgba(255,255,255,0.12)]',
    actionIconClass: 'text-[rgba(255,255,255,0.7)]',
    pinActiveClass: 'text-[#7C72F6]',
    checkboxDoneClass: 'bg-[#7C72F6] border-[#7C72F6] text-white',
    checkboxIdleClass: 'border-[rgba(255,255,255,0.45)] hover:border-[#FFFFFF]',
    countdownColor: '#F59E0B',
    countdownOverdueColor: '#EF4444',
    ringTrack: 'rgba(255,255,255,0.18)',
    ringText: '#FFFFFF',
    ringGlow: true,
  },
  paper: {
    // 外层留白:胶带探出卡片顶边 10px,卡片旋转 ±4px + 阴影晕开不越出窗口
    wrapperClass: 'w-[280px] box-border p-[14px] pt-[16px]',
    cardClass: 'w-full rounded-[6px] rotate-[-1.5deg] hover:rotate-0 hover:scale-[1.02] transition-[transform,rotate,scale,box-shadow] duration-200 ease-out shadow-[0_8px_20px_rgba(93,78,55,0.2)] hover:shadow-[0_14px_30px_rgba(93,78,55,0.3)]',
    cardStyle: { background: 'linear-gradient(180deg,#FFE9A8,#F7DC8E)' },
    contentClass: 'pl-[14px] pr-3 pb-3 pt-[18px]',
    titleClass: 'text-[#5D4E37]',
    subtextClass: 'text-[#5D4E37]',
    subtextDoneClass: 'text-[#8A7961]',
    metaClass: 'text-[#8A7961]',
    chipClass: 'bg-[rgba(93,78,55,0.12)] text-[#5D4E37]',
    actionBtnClass: 'hover:bg-[rgba(93,78,55,0.12)]',
    actionIconClass: 'text-[#8A7961]',
    pinActiveClass: 'text-[#F97316]',
    checkboxDoneClass: 'bg-[#F97316] border-[#F97316] text-white',
    checkboxIdleClass: 'border-[rgba(93,78,55,0.45)] hover:border-[#F97316]',
    countdownColor: '#8A7961',
    countdownOverdueColor: '#EF4444',
    ringTrack: 'rgba(93,78,55,0.15)',
    ringText: '#5D4E37',
    ringGlow: false,
  },
};

function ProgressRing({ done, total, color, trackColor, textColor, glow, size = 36, showCheck = false }: {
  done: number;
  total: number;
  color: string;
  trackColor: string;
  textColor: string;
  glow: boolean;
  size?: number;
  showCheck?: boolean;
}) {
  const strokeWidth = size >= 36 ? 3.5 : 2.5;
  const r = size >= 36 ? 15 : (size - strokeWidth) / 2 - 0.5;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const progress = total > 0 ? done / total : 0;
  // 初载从 0 生长到当前值;完成数变化时 spring 追赶新值,中心数字同步滚动
  const spring = useSpring(0, { stiffness: 170, damping: 26 });
  useEffect(() => {
    spring.set(progress);
  }, [spring, progress]);
  const dashOffset = useTransform(spring, (v) => circumference * (1 - v));
  const label = useTransform(spring, (v) => `${Math.round(v * total)}/${total}`);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <motion.circle
        cx={c} cy={c} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference}
        transform={`rotate(-90 ${c} ${c})`}
        style={{
          strokeDashoffset: dashOffset,
          ...(glow ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined),
        }}
      />
      {size >= 36 && (showCheck ? (
        <motion.path
          d="M12.5 18.2 L16 21.8 L23.5 13.5"
          fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        />
      ) : (
        <motion.text x={c} y={c} textAnchor="middle" dominantBaseline="central"
          fontSize="9" fontWeight="600" fill={textColor} className="tabular-nums">
          {label}
        </motion.text>
      ))}
    </svg>
  );
}

export function NoteCard({ task, children, style, alwaysOnTop, collapsed, onToggleAlwaysOnTop, onToggleCollapsed, onClose }: NoteCardProps) {
  const updateTask = useUpdateTask();
  const { data: tags } = useTags();
  const skin = SKINS[style];

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const countdown = useMemo(() => formatCountdown(task.due_date, now), [task.due_date, now]);
  const overdue = countdown?.overdue ?? false;

  const tagMap = useMemo(() => new Map((tags || []).map((t) => [t.id, t])), [tags]);
  const taskTags = (task.tag_ids || []).map((id) => tagMap.get(id)).filter((t): t is TagWithCount => !!t);

  const priorityColor = PRIORITY_HEX[task.priority] ?? PRIORITY_HEX[0];
  const total = children.length;
  const done = children.filter((c) => c.is_completed).length;
  const shownChildren = children.slice(0, 3);
  const hiddenCount = total - shownChildren.length;

  // 全完成庆祝:仅在"未全完成 → 全完成"沿触发(初始化即全完成不触发)
  const prevDoneRef = useRef(done);
  const [celebrating, setCelebrating] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  useEffect(() => {
    const prev = prevDoneRef.current;
    prevDoneRef.current = done;
    if (total > 0 && done === total && prev < total) {
      setCelebrating(true);
    }
  }, [done, total]);
  useEffect(() => {
    if (!celebrating) return;
    const t1 = window.setTimeout(() => setShowCheck(true), 150);
    const t2 = window.setTimeout(() => setShowCheck(false), 150 + 1200);
    const t3 = window.setTimeout(() => setCelebrating(false), 150 + 1200 + 50);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [celebrating]);

  const fade = {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
    transition: { duration: 0.15, ease: 'easeOut' as const },
  };

  if (collapsed) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key="minibar" {...fade}>
          <div
            data-testid="note-minibar"
            data-style={style}
            onClick={onToggleCollapsed}
            className={cn(
              'group relative flex h-[36px] w-[280px] cursor-pointer select-none items-center gap-2 px-2.5',
              skin.cardClass,
              // 迷你条贴满 36px 窗口:不做 hover 浮起/阴影/纸张旋转,避免边缘被裁
              'hover:scale-100 hover:shadow-none',
              style === 'paper' && 'rotate-0',
            )}
            style={skin.cardStyle}>
            {/* 迷你条故意不设拖拽区:Tauri 拖区的模态拖动循环会吃掉 click,
                点了就无法展开。要移动位置请先展开卡片再拖。 */}
            <span className="w-[8px] h-[8px] rounded-full flex-shrink-0"
              style={{ backgroundColor: priorityColor }} />
            <span className={cn(
              'flex-1 min-w-0 truncate text-[12px] font-medium',
              task.is_completed ? cn('line-through', skin.subtextDoneClass) : skin.titleClass,
            )}>
              {task.title}
            </span>
            {total > 0 && (
              <ProgressRing done={done} total={total} color={priorityColor}
                trackColor={skin.ringTrack} textColor={skin.ringText} glow={skin.ringGlow} size={20} />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapsed(); }}
              title="展开便签"
              aria-label="展开便签"
              className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors opacity-0 group-hover:opacity-100', skin.actionBtnClass)}>
              <Maximize2 size={11} className={skin.actionIconClass} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key="card" {...fade}>
        <div className={skin.wrapperClass || undefined}>
          <div
            data-testid="note-card"
            data-style={style}
            className={cn('group relative', skin.cardClass)}
            style={skin.cardStyle}>
            {/* 皮肤装饰(逾期时 glass 色带 / minimal 竖条呼吸脉动,paper 保持静态;已完成任务不脉动) */}
            {style === 'minimal' && (
              <div className={cn('absolute left-0 top-0 bottom-0 w-[4px]', overdue && !task.is_completed && 'note-overdue-breath')}
                style={{ backgroundColor: priorityColor }} />
            )}
            {style === 'glass' && (
              <div className={cn('absolute left-0 right-0 top-0 h-[3px]', overdue && !task.is_completed && 'note-overdue-breath')}
                style={{ backgroundColor: priorityColor, boxShadow: `0 0 12px ${priorityColor}66` }} />
            )}
            {style === 'paper' && (
              <>
                <div className="absolute inset-0 rounded-[6px] pointer-events-none"
                  style={{ backgroundImage: `url("${PAPER_NOISE}")`, opacity: 0.04 }} />
                <div className="absolute left-1/2 top-[-10px] z-10 h-[20px] w-[64px] rounded-[2px] pointer-events-none"
                  style={{
                    transform: 'translateX(-50%) rotate(-4deg)',
                    background: 'rgba(249,115,22,0.55)',
                    backdropFilter: 'blur(1px)',
                    boxShadow: '0 1px 3px rgba(93,78,55,0.18)',
                  }} />
                <div className="absolute bottom-0 right-0 w-[22px] h-[22px] rounded-br-[6px] pointer-events-none"
                  style={{ background: 'linear-gradient(315deg, #FFF3C4 0%, #F0D98C 45%, rgba(93,78,55,0.22) 50%, rgba(93,78,55,0.06) 58%, rgba(93,78,55,0) 70%)' }} />
              </>
            )}

            {/* 全完成涟漪:进度环合拢后泛开一圈优先级色 */}
            {celebrating && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <motion.div
                  data-testid="note-celebration"
                  className="w-[72px] h-[72px] rounded-full"
                  style={{ border: `2px solid ${priorityColor}`, boxShadow: `0 0 24px ${priorityColor}` }}
                  initial={{ scale: 0, opacity: 0.4 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            )}

            {/* 悬停浮现的操作按钮 */}
            <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <button
                onClick={onToggleCollapsed}
                title="折叠便签"
                aria-label="折叠便签"
                className={cn('w-5 h-5 rounded-full flex items-center justify-center transition-colors', skin.actionBtnClass)}>
                <Minus size={11} className={skin.actionIconClass} />
              </button>
              <button
                onClick={onToggleAlwaysOnTop}
                title={alwaysOnTop ? '取消置顶' : '置顶'}
                aria-label={alwaysOnTop ? '取消置顶' : '置顶便签'}
                className={cn('w-5 h-5 rounded-full flex items-center justify-center transition-colors', skin.actionBtnClass)}>
                {alwaysOnTop
                  ? <PinOff size={11} className={skin.pinActiveClass} />
                  : <Pin size={11} className={skin.actionIconClass} />}
              </button>
              <button
                onClick={onClose}
                title="关闭便签"
                aria-label="关闭便签"
                className={cn('w-5 h-5 rounded-full flex items-center justify-center transition-colors', skin.actionBtnClass)}>
                <X size={11} className={skin.actionIconClass} />
              </button>
            </div>

            <div className={skin.contentClass}>
              {/* 标题栏(拖动区):deep 让整条标题栏都可拖,裸属性只有直接点中元素本体才生效 */}
              <div data-tauri-drag-region="deep" className="pr-16 cursor-move select-none">
                <h3 className={cn(
                  'text-[13px] font-bold leading-snug line-clamp-2',
                  task.is_completed ? cn('line-through', skin.subtextDoneClass) : skin.titleClass,
                )}>
                  {task.title}
                </h3>
              </div>

              {/* 倒计时(已完成任务改为完成态标记,不再渲染倒计时/逾期呼吸) */}
              {task.is_completed ? (
                <div className={cn('mt-1 text-[11px] font-medium flex items-center gap-1', skin.metaClass)}>
                  <Check size={11} style={{ strokeWidth: 3 }} />
                  已完成
                </div>
              ) : countdown && (
                <div className="mt-1 text-[11px] font-medium"
                  style={{ color: overdue ? skin.countdownOverdueColor : skin.countdownColor }}>
                  {countdown.text}
                </div>
              )}

              {/* 进度环 + 子任务清单 */}
              {total > 0 && (
                <div className="mt-2.5 flex items-start gap-2.5">
                  <ProgressRing done={done} total={total} color={priorityColor}
                    trackColor={skin.ringTrack} textColor={skin.ringText} glow={skin.ringGlow}
                    showCheck={showCheck} />
                  <div className="flex-1 min-w-0 space-y-1 pt-0.5">
                    {shownChildren.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateTask.mutate({ id: sub.id, is_completed: !sub.is_completed })}
                          aria-label={sub.is_completed ? `标记子任务未完成 "${sub.title}"` : `标记子任务完成 "${sub.title}"`}
                          className={cn(
                            'w-[13px] h-[13px] rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors',
                            sub.is_completed ? skin.checkboxDoneClass : skin.checkboxIdleClass,
                          )}>
                          {sub.is_completed && <Check size={8} style={{ strokeWidth: 3.5 }} />}
                        </button>
                        {/* 划线用 background-size 生长动画,与颜色一起走 200ms */}
                        <span
                          className={cn(
                            'text-[11px] truncate transition-all duration-200',
                            sub.is_completed ? skin.subtextDoneClass : skin.subtextClass,
                          )}
                          style={{
                            backgroundImage: 'linear-gradient(currentColor, currentColor)',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: '0 58%',
                            backgroundSize: sub.is_completed ? '100% 1px' : '0% 1px',
                          }}>
                          {sub.title}
                        </span>
                      </div>
                    ))}
                    {hiddenCount > 0 && (
                      <div className={cn('text-[10px]', skin.metaClass)}>还有 {hiddenCount} 项</div>
                    )}
                  </div>
                </div>
              )}

              {/* 标签 */}
              {taskTags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {taskTags.map((t) => (
                    <span key={t.id} className={cn('text-[10px] px-1.5 py-0.5 rounded-md', skin.chipClass)}>
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
