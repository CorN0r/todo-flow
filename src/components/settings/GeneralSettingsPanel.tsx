import { useEffect, useState } from 'react';
import { Bell, Check, Flame, Lightbulb, Monitor, Moon, Rocket, Sparkles, Sun } from 'lucide-react';
import { enable as enableAutoStart, disable as disableAutoStart, isEnabled as isAutoStartEnabled } from '@tauri-apps/plugin-autostart';
import { getRepositories } from '../../domain/repositories/current';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/cn';
import { SettingsCard, SettingsRow, SettingsSectionHeader, SettingsToggle } from './SettingsPrimitives';

type ThemeOption = {
  key: 'light' | 'dark' | 'system' | 'glass' | 'warm' | 'lumina';
  label: string;
  desc: string;
  icon: typeof Sun;
  previewBg: string;
  previewAccent: string;
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    key: 'light',
    label: '浅色',
    desc: '明亮通透',
    icon: Sun,
    previewBg: '#F6F6FA',
    previewAccent: '#7C72F6',
  },
  {
    key: 'dark',
    label: '深色',
    desc: '沉静护眼',
    icon: Moon,
    previewBg: '#161626',
    previewAccent: '#7972F8',
  },
  {
    key: 'warm',
    label: '温暖石炭',
    desc: '暖炭哑金',
    icon: Flame,
    previewBg: '#1c1a17',
    previewAccent: '#C9A84C',
  },
  {
    key: 'lumina',
    label: '浮光',
    desc: '柔和灰蓝',
    icon: Lightbulb,
    previewBg: '#FAF9F7',
    previewAccent: '#6B7FA0',
  },
  {
    key: 'glass',
    label: '玻璃',
    desc: '半透明质感',
    icon: Sparkles,
    previewBg: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
    previewAccent: '#8678f8',
  },
  {
    key: 'system',
    label: '跟随系统',
    desc: '自动切换',
    icon: Monitor,
    previewBg: 'linear-gradient(135deg, #F6F6FA 49.5%, #161626 50.5%)',
    previewAccent: '#7C72F6',
  },
];

export function GeneralSettingsPanel() {
  const { theme, setTheme } = useTheme();
  const [autoStart, setAutoStart] = useState(false);
  const [systemNotify, setSystemNotify] = useState(true);

  useEffect(() => {
    getRepositories().settings.get('reminder_system_notify').then((v) => {
      setSystemNotify(v !== '0');
    }).catch(() => {});
    isAutoStartEnabled().then(setAutoStart).catch(() => {});
  }, []);

  const toggleAutoStart = (enabled: boolean) => {
    setAutoStart(enabled);
    if (enabled) {
      enableAutoStart().catch(() => setAutoStart(false));
    } else {
      disableAutoStart().catch(() => setAutoStart(true));
    }
  };

  // 提醒弹窗常驻显示;系统通知是额外留档,可单独关闭(Rust 轮询每轮读取该设置)
  const toggleSystemNotify = (enabled: boolean) => {
    setSystemNotify(enabled);
    getRepositories().settings.set('reminder_system_notify', enabled ? '1' : '0');
  };

  return (
    <div className="space-y-6">
      {/* 外观主题 */}
      <section>
        <SettingsSectionHeader
          title="外观主题"
          description="选择界面的配色风格，会同步应用到悬浮窗"
        />
        <SettingsCard className="p-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = theme === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTheme(opt.key)}
                  aria-pressed={selected}
                  className={cn(
                    'flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all',
                    selected
                      ? 'border-[#7C72F6] bg-[#7C72F6]/[0.08]'
                      : 'border-[#F3F4F6] dark:border-white/[0.07] hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04]',
                  )}
                >
                  <div
                    className="w-9 h-9 rounded-lg overflow-hidden ring-1 ring-inset ring-black/10 dark:ring-white/15 shrink-0 relative flex items-center justify-center"
                    style={{
                      background: opt.previewBg,
                      backgroundRepeat: 'no-repeat',
                    }}
                  >
                    <span
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: opt.previewAccent }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <Icon size={12} className="text-[#6B7280] shrink-0" />
                      <span className="text-[12.5px] font-medium text-[#111827] dark:text-white/90 truncate">
                        {opt.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9CA3AF] truncate">{opt.desc}</div>
                  </div>
                  {selected && (
                    <Check size={14} className="text-[#7C72F6] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </SettingsCard>
      </section>

      {/* 启动与提醒 */}
      <section>
        <SettingsSectionHeader
          title="启动与提醒"
          description="管理应用的启动行为和到期提醒方式"
        />
        <SettingsCard divided>
          <SettingsRow
            icon={<Rocket size={16} />}
            title="开机启动"
            description="登录 Windows 后自动启动 TodoFlow"
            control={
              <SettingsToggle
                checked={autoStart}
                onChange={toggleAutoStart}
                ariaLabel="开机启动"
              />
            }
          />
          <SettingsRow
            icon={<Bell size={16} />}
            title="系统通知"
            description="提醒到期时会弹出常驻提醒窗口；开启后同时发送一条 Windows 系统通知作为记录"
            control={
              <SettingsToggle
                checked={systemNotify}
                onChange={toggleSystemNotify}
                ariaLabel="系统通知"
              />
            }
          />
        </SettingsCard>
      </section>
    </div>
  );
}
