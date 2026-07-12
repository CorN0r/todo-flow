import { describe, expect, it, vi } from 'vitest';
import { createPlatformRepository, detectPlatformKind } from '../../domain/adapters/platformServices';

const ANDROID_WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 14; sdk_gphone64_x86_64 Build/UE1A.230829.050; wv) AppleWebKit/537.36 Chrome/113.0.5672.136 Mobile Safari/537.36';

describe('platformServices', () => {
  it('detects Android WebView as the Android platform', () => {
    expect(detectPlatformKind(ANDROID_WEBVIEW_UA)).toBe('android');
    expect(detectPlatformKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });

  it('keeps Android-only platform capabilities behind explicit placeholders', async () => {
    const platform = createPlatformRepository('android');
    const onDrop = vi.fn();

    expect(platform.kind).toBe('android');
    await expect(platform.hideToTray()).resolves.toBeUndefined();
    await expect(platform.showPomodoroWindow()).resolves.toBeUndefined();
    await expect(platform.sendNotification({ title: 'TodoFlow', body: 'Done' })).resolves.toBeUndefined();
    await expect(platform.chooseFiles({ multiple: true })).resolves.toEqual([]);
    await expect(platform.chooseSavePath()).resolves.toBeNull();

    const share = await platform.share({ title: 'TodoFlow', text: 'Task' });
    const background = await platform.registerBackgroundWork({ id: 'sync', reason: 'sync' });
    const unsubscribe = await platform.onFileDrop(onDrop);

    expect(share.supported).toBe(false);
    expect(background.supported).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
    expect(unsubscribe()).toBeUndefined();
  });
});
