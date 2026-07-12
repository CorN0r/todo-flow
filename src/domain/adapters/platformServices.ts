import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { isAndroidUserAgent } from '../../platform/appSurface';
import * as db from '../../lib/db';
import type {
  PlatformBackgroundWorkRequest,
  PlatformCapabilityResult,
  PlatformKind,
  PlatformOpenFileOptions,
  PlatformRepository,
  PlatformSaveFileOptions,
  PlatformShareRequest,
} from '../repositories';

function unsupported(reason: string): PlatformCapabilityResult {
  return { supported: false, reason };
}

export function detectPlatformKind(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): PlatformKind {
  if (isAndroidUserAgent(userAgent)) return 'android';
  if (typeof window === 'undefined') return 'test';
  return 'desktop';
}

function normalizeSelectedFiles(selected: string | string[] | null): string[] {
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

async function chooseDesktopFiles(options: PlatformOpenFileOptions = {}) {
  const selected = await open({
    multiple: options.multiple,
    filters: options.filters,
  });
  return normalizeSelectedFiles(selected as string | string[] | null);
}

async function chooseDesktopSavePath(options: PlatformSaveFileOptions = {}) {
  const selected = await save({
    defaultPath: options.defaultPath,
    filters: options.filters,
  });
  return selected ?? null;
}

function createDesktopPlatformRepository(): PlatformRepository {
  return {
    kind: 'desktop',
    hideToTray: () => db.hideToTray(),
    showMainFromWidget: () => db.showMainFromWidget(),
    showWidgetContextMenu: (x, y) => db.showWidgetContextMenu(x, y),
    showPomodoroWindow: () => db.showPomodoroWindow(),
    hidePomodoroWindow: () => db.hidePomodoroWindow(),
    async sendNotification(request) {
      sendNotification(request);
    },
    chooseFiles: chooseDesktopFiles,
    chooseSavePath: chooseDesktopSavePath,
    readFileBytes: (path) => readFile(path),
    toFileAssetUrl: (path) => convertFileSrc(path),
    async share(_request: PlatformShareRequest) {
      return unsupported('Desktop share intents are not implemented yet.');
    },
    async registerBackgroundWork(_request: PlatformBackgroundWorkRequest) {
      return unsupported('Desktop background work uses foreground app timers in this phase.');
    },
    async onFileDrop(handler) {
      return getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        handler({
          paths: event.payload.paths,
          position: event.payload.position,
        });
      });
    },
  };
}

function createAndroidPlatformRepository(): PlatformRepository {
  return {
    kind: 'android',
    async hideToTray() {},
    async showMainFromWidget() {},
    async showWidgetContextMenu() {},
    async showPomodoroWindow() {},
    async hidePomodoroWindow() {},
    async sendNotification(_request) {
      // Android notification scheduling is introduced behind this boundary in a later task.
    },
    async chooseFiles(_options) {
      return [];
    },
    async chooseSavePath(_options) {
      return null;
    },
    readFileBytes: (path) => readFile(path),
    toFileAssetUrl: (path) => convertFileSrc(path),
    async share(_request) {
      return unsupported('Android share intents are reserved for the native adapter.');
    },
    async registerBackgroundWork(_request) {
      return unsupported('Android background work is reserved for the native adapter.');
    },
    async onFileDrop() {
      return () => {};
    },
  };
}

export function createPlatformRepository(kind = detectPlatformKind()): PlatformRepository {
  if (kind === 'android') return createAndroidPlatformRepository();
  return createDesktopPlatformRepository();
}
