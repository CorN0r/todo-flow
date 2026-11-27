import { Keyboard } from 'lucide-react';
import { useShortcutStore } from '../../stores/shortcutStore';
import { ShortcutEditor } from '../shared/ShortcutEditor';
import { SettingsCard, SettingsRow, SettingsSectionHeader, SettingsToggle } from './SettingsPrimitives';

export function ShortcutSettingsPanel() {
  const shortcutsEnabled = useShortcutStore((s) => s.shortcutsEnabled);
  const setShortcutsEnabled = useShortcutStore((s) => s.setShortcutsEnabled);

  return (
    <div className="space-y-6">
      <section>
        <SettingsSectionHeader
          title="快捷键总控"
          description="自定义全局热键与应用内快捷键，支持冲突检测与一键恢复默认"
        />
        <SettingsCard>
          <SettingsRow
            icon={<Keyboard size={16} />}
            title="启用快捷键"
            description="关闭后将暂停响应所有全局及应用内自定义快捷键"
            control={
              <SettingsToggle
                checked={shortcutsEnabled}
                onChange={setShortcutsEnabled}
                ariaLabel="启用快捷键"
              />
            }
          />
        </SettingsCard>
      </section>

      <section>
        <ShortcutEditor />
      </section>
    </div>
  );
}
