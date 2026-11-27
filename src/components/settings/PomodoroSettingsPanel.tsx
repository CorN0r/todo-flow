import { usePomodoroStore } from '../../stores/pomodoroStore';
import { SettingsCard, SettingsRow, SettingsSectionHeader, SettingsToggle } from './SettingsPrimitives';

function StepperControl({
  value,
  unit,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
}: {
  value: number;
  unit: string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={decrementLabel}
        onClick={onDecrement}
        className="w-7 h-7 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm"
      >
        −
      </button>
      <span className="w-8 text-center text-[13px] font-semibold tabular-nums text-[#111827] dark:text-white/90">
        {value}
      </span>
      <button
        type="button"
        aria-label={incrementLabel}
        onClick={onIncrement}
        className="w-7 h-7 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] dark:hover:text-white/80 hover:bg-[#F3F4F6] dark:hover:bg-white/[0.06] transition-colors text-sm"
      >
        +
      </button>
      <span className="text-[11px] text-[#9CA3AF] ml-0.5 w-7">{unit}</span>
    </div>
  );
}

export function PomodoroSettingsPanel() {
  const pomodoroConfig = usePomodoroStore((s) => s.config);
  const updatePomodoroConfig = usePomodoroStore((s) => s.updateConfig);

  return (
    <div className="space-y-6">
      <section>
        <SettingsSectionHeader
          title="计时周期"
          description="自定义每轮专注、短休息和长休息的时长"
        />
        <SettingsCard divided>
          <SettingsRow
            title="专注时长"
            description="单轮专注计时长度（5–120 分钟）"
            control={
              <StepperControl
                value={pomodoroConfig.focusMinutes}
                unit="分钟"
                decrementLabel="减少专注时长"
                incrementLabel="增加专注时长"
                onDecrement={() => updatePomodoroConfig({ focusMinutes: Math.max(5, pomodoroConfig.focusMinutes - 5) })}
                onIncrement={() => updatePomodoroConfig({ focusMinutes: Math.min(120, pomodoroConfig.focusMinutes + 5) })}
              />
            }
          />
          <SettingsRow
            title="短休息"
            description="每轮专注后的短暂放松（1–30 分钟）"
            control={
              <StepperControl
                value={pomodoroConfig.shortBreakMinutes}
                unit="分钟"
                decrementLabel="减少短休息时长"
                incrementLabel="增加短休息时长"
                onDecrement={() => updatePomodoroConfig({ shortBreakMinutes: Math.max(1, pomodoroConfig.shortBreakMinutes - 1) })}
                onIncrement={() => updatePomodoroConfig({ shortBreakMinutes: Math.min(30, pomodoroConfig.shortBreakMinutes + 1) })}
              />
            }
          />
          <SettingsRow
            title="长休息"
            description="连续完成多轮专注后的深度休息（5–60 分钟）"
            control={
              <StepperControl
                value={pomodoroConfig.longBreakMinutes}
                unit="分钟"
                decrementLabel="减少长休息时长"
                incrementLabel="增加长休息时长"
                onDecrement={() => updatePomodoroConfig({ longBreakMinutes: Math.max(5, pomodoroConfig.longBreakMinutes - 5) })}
                onIncrement={() => updatePomodoroConfig({ longBreakMinutes: Math.min(60, pomodoroConfig.longBreakMinutes + 5) })}
              />
            }
          />
          <SettingsRow
            title="长休间隔"
            description="每完成几轮专注进入一次长休息（1–10 轮）"
            control={
              <StepperControl
                value={pomodoroConfig.sessionsUntilLongBreak}
                unit="轮"
                decrementLabel="减少长休间隔"
                incrementLabel="增加长休间隔"
                onDecrement={() => updatePomodoroConfig({ sessionsUntilLongBreak: Math.max(1, pomodoroConfig.sessionsUntilLongBreak - 1) })}
                onIncrement={() => updatePomodoroConfig({ sessionsUntilLongBreak: Math.min(10, pomodoroConfig.sessionsUntilLongBreak + 1) })}
              />
            }
          />
        </SettingsCard>
      </section>

      <section>
        <SettingsSectionHeader
          title="自动流转"
          description="阶段结束后是否自动进入下一阶段计时"
        />
        <SettingsCard divided>
          <SettingsRow
            title="自动开始休息"
            description="专注倒计时结束后直接开始休息计时"
            control={
              <SettingsToggle
                checked={pomodoroConfig.autoStartBreak}
                onChange={(v) => updatePomodoroConfig({ autoStartBreak: v })}
                ariaLabel="自动开始休息"
              />
            }
          />
          <SettingsRow
            title="自动开始专注"
            description="休息结束后自动开始下一轮专注"
            control={
              <SettingsToggle
                checked={pomodoroConfig.autoStartFocus}
                onChange={(v) => updatePomodoroConfig({ autoStartFocus: v })}
                ariaLabel="自动开始专注"
              />
            }
          />
        </SettingsCard>
      </section>
    </div>
  );
}
