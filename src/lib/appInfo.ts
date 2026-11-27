import { getName, getTauriVersion, getVersion } from '@tauri-apps/api/app';
import { open as openExternal } from '@tauri-apps/plugin-shell';

export const APP_META = {
  name: 'TodoFlow',
  fallbackVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.10.0',
  identifier: 'com.todoflow.desktop',
  tagline: '面向 Windows 的本地优先待办事项与专注管理应用',
  license: 'MIT License',
  storage: '本地优先 · SQLite',
  repositoryUrl: 'https://gitcode.com/CorN0r/todo-flow',
  docsUrl: 'https://gitcode.com/CorN0r/todo-flow#readme',
  issuesUrl: 'https://gitcode.com/CorN0r/todo-flow/issues',
  techStack: ['Tauri v2', 'React 19', 'TypeScript', 'Tailwind CSS', 'SQLite', 'TipTap', 'Lucide'],
} as const;

export interface RuntimeAppInfo {
  name: string;
  version: string;
  tauriVersion: string | null;
}

export async function loadRuntimeAppInfo(): Promise<RuntimeAppInfo> {
  const [name, version, tauriVersion] = await Promise.all([
    getName().catch(() => APP_META.name),
    getVersion().catch(() => APP_META.fallbackVersion),
    getTauriVersion().catch(() => null),
  ]);
  return {
    name: name || APP_META.name,
    version: version || APP_META.fallbackVersion,
    tauriVersion: tauriVersion || null,
  };
}

export async function openExternalLink(url: string): Promise<void> {
  try {
    await openExternal(url);
  } catch {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      throw new Error('无法打开外部链接');
    }
  }
}

export function formatDiagnosticInfo(info: RuntimeAppInfo): string {
  const lines = [
    `${info.name} v${info.version}`,
    `Identifier: ${APP_META.identifier}`,
    info.tauriVersion ? `Tauri: ${info.tauriVersion}` : 'Tauri: v2',
    typeof navigator !== 'undefined' && navigator.userAgent ? `UserAgent: ${navigator.userAgent}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
