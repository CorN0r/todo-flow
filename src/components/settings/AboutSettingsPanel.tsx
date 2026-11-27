import { useEffect, useState } from 'react';
import { BookOpen, Bug, Check, Copy, ExternalLink, GitBranch, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import {
  APP_META,
  formatDiagnosticInfo,
  loadRuntimeAppInfo,
  openExternalLink,
  type RuntimeAppInfo,
} from '../../lib/appInfo';
import { SettingsCard, SettingsSectionHeader } from './SettingsPrimitives';

export function AboutSettingsPanel() {
  const [appInfo, setAppInfo] = useState<RuntimeAppInfo>({
    name: APP_META.name,
    version: APP_META.fallbackVersion,
    tauriVersion: null,
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRuntimeAppInfo().then((info) => {
      if (!cancelled) setAppInfo(info);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleCopyInfo = async () => {
    const text = formatDiagnosticInfo(appInfo);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('已复制软件与环境信息');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败，请手动记录版本号');
    }
  };

  const handleOpenLink = async (url: string) => {
    try {
      await openExternalLink(url);
    } catch (err) {
      toast.error(`无法打开链接: ${String(err)}`);
    }
  };

  const infoItems: { label: string; value: string; mono?: boolean }[] = [
    { label: '当前版本', value: `v${appInfo.version}`, mono: true },
    { label: '运行框架', value: appInfo.tauriVersion ? `Tauri v${appInfo.tauriVersion}` : 'Tauri v2', mono: true },
    { label: '开源协议', value: APP_META.license },
    { label: '数据存储', value: APP_META.storage },
    { label: '应用标识', value: APP_META.identifier, mono: true },
  ];

  const links = [
    {
      label: '项目仓库',
      desc: '查看源码与版本发布记录',
      url: APP_META.repositoryUrl,
      icon: GitBranch,
    },
    {
      label: '使用文档',
      desc: '功能介绍、快捷键与 MCP 集成指南',
      url: APP_META.docsUrl,
      icon: BookOpen,
    },
    {
      label: '问题反馈',
      desc: '提交 Bug 报告或新功能建议',
      url: APP_META.issuesUrl,
      icon: Bug,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 品牌名片 */}
      <SettingsCard className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #818CF8 0%, #A855F7 55%, #EC4899 100%)',
              }}
            >
              <ListChecks size={24} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[17px] font-bold text-[#111827] dark:text-white leading-tight">
                  {appInfo.name}
                </h4>
                <span
                  data-testid="about-version-badge"
                  className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-[#7C72F6]/[0.10] text-[#7C72F6]"
                >
                  v{appInfo.version}
                </span>
              </div>
              <p className="text-[12.5px] text-[#6B7280] dark:text-[#9CA3AF] mt-1">
                {APP_META.tagline}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyInfo}
            className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-[#E5E7EB] dark:border-white/[0.10] bg-[#F9FAFB] dark:bg-white/[0.04] hover:bg-[#F3F4F6] dark:hover:bg-white/[0.08] text-[#111827] dark:text-white/90 font-medium transition-colors shrink-0"
          >
            {copied ? <Check size={13} className="text-[#10B981]" /> : <Copy size={13} />}
            {copied ? '已复制' : '复制版本信息'}
          </button>
        </div>
      </SettingsCard>

      {/* 软件信息 */}
      <section>
        <SettingsSectionHeader title="软件信息" />
        <SettingsCard divided>
          {infoItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-4 px-4 py-3 text-[13px]">
              <span className="text-[#6B7280] dark:text-[#9CA3AF]">{item.label}</span>
              <span
                className={
                  item.mono
                    ? 'font-mono text-[12.5px] text-[#111827] dark:text-white/90'
                    : 'text-[#111827] dark:text-white/90 font-medium'
                }
              >
                {item.value}
              </span>
            </div>
          ))}
        </SettingsCard>
      </section>

      {/* 相关链接 */}
      <section>
        <SettingsSectionHeader title="相关链接" />
        <SettingsCard divided>
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleOpenLink(item.url)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#F9FAFB] dark:hover:bg-white/[0.04] transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon size={15} className="text-[#6B7280] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[#111827] dark:text-white/90">{item.label}</div>
                    <div className="text-[11.5px] text-[#9CA3AF] truncate">{item.desc}</div>
                  </div>
                </div>
                <ExternalLink size={14} className="text-[#9CA3AF] shrink-0" />
              </button>
            );
          })}
        </SettingsCard>
      </section>

      {/* 技术栈与版权 */}
      <section>
        <SettingsSectionHeader title="构建技术" />
        <SettingsCard className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {APP_META.techStack.map((tech) => (
              <span
                key={tech}
                className="text-[11.5px] px-2.5 py-1 rounded-full bg-[#F3F4F6] dark:bg-white/[0.06] text-[#6B7280] dark:text-[#C4C4CC]"
              >
                {tech}
              </span>
            ))}
          </div>
          <p className="text-[11.5px] text-[#9CA3AF]">
            © TodoFlow · 基于 {APP_META.license} 开源
          </p>
        </SettingsCard>
      </section>
    </div>
  );
}
