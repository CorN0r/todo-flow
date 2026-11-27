import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bot,
  Database,
  Info,
  Keyboard,
  PanelBottom,
  SlidersHorizontal,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { APP_META } from '../lib/appInfo';
import { AiModelSettings } from '../components/ai/AiModelSettings';
import { GeneralSettingsPanel } from '../components/settings/GeneralSettingsPanel';
import { DesktopWidgetSettingsPanel } from '../components/settings/DesktopWidgetSettingsPanel';
import { PomodoroSettingsPanel } from '../components/settings/PomodoroSettingsPanel';
import { ShortcutSettingsPanel } from '../components/settings/ShortcutSettingsPanel';
import { DataSettingsPanel } from '../components/settings/DataSettingsPanel';
import { AboutSettingsPanel } from '../components/settings/AboutSettingsPanel';

export type SettingsSectionId =
  | 'general'
  | 'desktop'
  | 'focus'
  | 'shortcuts'
  | 'ai'
  | 'data'
  | 'about';

interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  summary: string;
  icon: LucideIcon;
}

interface SettingsNavCluster {
  clusterLabel: string;
  items: SettingsNavItem[];
}

const NAV_CLUSTERS: SettingsNavCluster[] = [
  {
    clusterLabel: '基础与桌面',
    items: [
      {
        id: 'general',
        label: '常规',
        summary: '外观主题、开机启动与提醒通知',
        icon: SlidersHorizontal,
      },
      {
        id: 'desktop',
        label: '桌面组件',
        summary: '悬浮球大小与配色、桌面便签管理',
        icon: PanelBottom,
      },
    ],
  },
  {
    clusterLabel: '效率与智能',
    items: [
      {
        id: 'focus',
        label: '番茄钟',
        summary: '专注与休息时长、阶段自动流转',
        icon: Timer,
      },
      {
        id: 'shortcuts',
        label: '快捷键',
        summary: '全局热键与应用内快捷操作',
        icon: Keyboard,
      },
      {
        id: 'ai',
        label: 'AI 模型',
        summary: '模型服务连接、API Key 与默认模型',
        icon: Bot,
      },
    ],
  },
  {
    clusterLabel: '数据与软件',
    items: [
      {
        id: 'data',
        label: '数据与工作区',
        summary: '工作区切换、备份恢复、导出与任务历史',
        icon: Database,
      },
      {
        id: 'about',
        label: '关于',
        summary: '软件版本、运行环境与项目链接',
        icon: Info,
      },
    ],
  },
];

const ALL_NAV_ITEMS: SettingsNavItem[] = NAV_CLUSTERS.flatMap((c) => c.items);
const VALID_SECTIONS = new Set<SettingsSectionId>(ALL_NAV_ITEMS.map((i) => i.id));

const ACTIVE_TAB =
  'bg-[rgba(124,114,246,0.1)] sidebar-selected font-medium dark:bg-[rgba(124,114,246,0.125)] dark:text-white';
const INACTIVE_TAB =
  'text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-[#C4C4CC] dark:hover:bg-white/[0.04] dark:hover:text-white';

export function SettingsPage({ initialSection }: { initialSection?: SettingsSectionId }) {
  const [searchParams] = useSearchParams();
  const queryTab = searchParams.get('tab') as SettingsSectionId | null;
  const resolvedInitial: SettingsSectionId =
    initialSection ?? (queryTab && VALID_SECTIONS.has(queryTab) ? queryTab : 'general');

  const [activeSection, setActiveSection] = useState<SettingsSectionId>(resolvedInitial);
  const currentMeta = ALL_NAV_ITEMS.find((item) => item.id === activeSection) ?? ALL_NAV_ITEMS[0];
  const CurrentIcon = currentMeta.icon;

  return (
    <div className="max-w-[920px] pb-12">
      {/* Page Title */}
      <div className="mb-6">
        <h3 className="text-[20px] font-bold text-[#111827] dark:text-white">设置</h3>
        <p className="text-[12.5px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">
          按类别管理外观、桌面组件、效率工具、AI 模型与本地数据
        </p>
      </div>

      {/* Responsive two-column layout */}
      <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-8">
        {/* Single responsive navigation rail (horizontal pills on narrow viewports, sticky rail on desktop) */}
        <nav
          aria-label="设置导航"
          className="flex flex-col md:w-[196px] md:shrink-0 md:sticky md:top-0 gap-4"
        >
          <div
            role="tablist"
            aria-label="设置分类"
            className="flex md:flex-col items-center md:items-stretch gap-1.5 md:gap-4 overflow-x-auto md:overflow-visible pb-1 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0"
          >
            {NAV_CLUSTERS.map((cluster) => (
              <div
                key={cluster.clusterLabel}
                className="flex md:flex-col items-center md:items-stretch gap-1.5 md:gap-1 shrink-0"
              >
                <div className="hidden md:block px-3 pb-1 text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF]">
                  {cluster.clusterLabel}
                </div>
                {cluster.items.map((item) => {
                  const Icon = item.icon;
                  const selected = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`settings-tab-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={`settings-panel-${item.id}`}
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        'flex items-center gap-2 md:gap-2.5 px-3 py-1.5 md:py-0 md:h-[34px] md:w-full rounded-lg text-[12.5px] md:text-[13.5px] whitespace-nowrap transition-colors text-left shrink-0',
                        selected ? ACTIVE_TAB : INACTIVE_TAB,
                      )}
                    >
                      <Icon size={15} className="shrink-0 opacity-85" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="hidden md:block pt-3 border-t border-[#F3F4F6] dark:border-white/[0.06] px-3">
            <button
              type="button"
              onClick={() => setActiveSection('about')}
              className="text-[11px] text-[#9CA3AF] hover:text-[#7C72F6] transition-colors tabular-nums"
            >
              {APP_META.name} v{APP_META.fallbackVersion}
            </button>
          </div>
        </nav>

        {/* Right content area */}
        <div
          id={`settings-panel-${activeSection}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeSection}`}
          className="flex-1 min-w-0 max-w-[640px]"
        >
          <div className="flex items-center gap-2.5 pb-3.5 mb-5 border-b border-[#F3F4F6] dark:border-white/[0.06]">
            <div className="w-8 h-8 rounded-lg bg-[#7C72F6]/[0.10] text-[#7C72F6] flex items-center justify-center shrink-0">
              <CurrentIcon size={16} />
            </div>
            <div className="min-w-0">
              <h4 className="text-[15px] font-semibold text-[#111827] dark:text-white leading-tight">
                {currentMeta.label}
              </h4>
              <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF] mt-0.5 truncate">
                {currentMeta.summary}
              </p>
            </div>
          </div>

          {activeSection === 'general' && <GeneralSettingsPanel />}
          {activeSection === 'desktop' && <DesktopWidgetSettingsPanel />}
          {activeSection === 'focus' && <PomodoroSettingsPanel />}
          {activeSection === 'shortcuts' && <ShortcutSettingsPanel />}
          {activeSection === 'ai' && <AiModelSettings />}
          {activeSection === 'data' && <DataSettingsPanel />}
          {activeSection === 'about' && <AboutSettingsPanel />}
        </div>
      </div>
    </div>
  );
}
