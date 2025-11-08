import type { SweetLinkScreenshotCommand, SweetLinkScreenshotResultData } from '@sweetlink/shared';
import type { ScreenshotTargetInfo, SweetLinkScreenshotHooks } from '../types';
import { getBrowserWindow } from '../utils/environment';
import { clamp } from '../utils/number';
import { applyScreenshotPreHooks } from './hooks';
import { captureWithDomToImage, stripDataUrlPrefix } from './renderers/dom-to-image';
import { captureWithHtml2Canvas } from './renderers/html2canvas';
import { resolveScreenshotTarget } from './targets';
import { loadDomToImage, recordScreenshotError } from './utils';

type DomToImageModule = Awaited<ReturnType<typeof loadDomToImage>>;
type ScreenshotLibsCache = {
  html2canvas?: () => Promise<typeof import('html2canvas')['default']>;
  domToImage?: () => Promise<DomToImageModule>;
};

export function createScreenshotHooks(): SweetLinkScreenshotHooks & {
  readonly testHelpers: {
    stripDataUrlPrefix: typeof stripDataUrlPrefix;
  };
} {
  let preloadPromise: Promise<void> | null = null;

  const preloadLibraries = (): Promise<void> => {
    if (preloadPromise) {
      return preloadPromise;
    }
    preloadPromise = (async () => {
      const browserWindow = getBrowserWindow();
      if (!browserWindow) {
        return;
      }
      try {
        const [html2canvas] = await Promise.all([
          import('html2canvas').then((module) => module.default),
          loadDomToImage()
            .then((domToImageModule) => {
              const debugWindow = browserWindow as Window & {
                __sweetlinkScreenshotLibs?: ScreenshotLibsCache;
              };
              debugWindow.__sweetlinkScreenshotLibs ??= {};
              if (!debugWindow.__sweetlinkScreenshotLibs.domToImage) {
                debugWindow.__sweetlinkScreenshotLibs.domToImage = () => Promise.resolve(domToImageModule);
              }
              return domToImageModule;
            })
            .catch((error: unknown) => {
              recordScreenshotError('domToImage', error);
              return undefined;
            }),
        ]);
        const debugWindow = browserWindow as Window & {
          __sweetlinkScreenshotLibs?: ScreenshotLibsCache;
        };
        debugWindow.__sweetlinkScreenshotLibs ??= {};
        if (!debugWindow.__sweetlinkScreenshotLibs.html2canvas) {
          debugWindow.__sweetlinkScreenshotLibs.html2canvas = () => Promise.resolve(html2canvas);
        }
      } catch (error) {
        console.warn('[SweetLink] Failed to preload screenshot libraries', error);
      }
    })();
    return preloadPromise;
  };

  const captureScreenshot = async (
    command: SweetLinkScreenshotCommand,
    targetInfo: ScreenshotTargetInfo
  ): Promise<SweetLinkScreenshotResultData> => {
    const quality = typeof command.quality === 'number' ? clamp(command.quality, 0, 1) : 0.92;
    const rendererPreference = command.renderer ?? 'auto';
    if (rendererPreference === 'html-to-image') {
      return await captureWithDomToImage(targetInfo, quality);
    }

    try {
      return await captureWithHtml2Canvas(targetInfo, quality);
    } catch (primaryError) {
      const fallbackResult = await tryCaptureWithDomToImage(targetInfo, quality);
      if (fallbackResult.ok) {
        return fallbackResult.value;
      }
      const primary = primaryError instanceof Error ? primaryError : new Error(String(primaryError));
      const fallbackMessage =
        fallbackResult.error instanceof Error ? fallbackResult.error.message : String(fallbackResult.error);
      primary.message = `${primary.message}; fallback failed: ${fallbackMessage}`;
      if (!primary.stack && fallbackResult.error instanceof Error) {
        primary.stack = fallbackResult.error.stack;
      }
      throw primary;
    }
  };

  return {
    preloadLibraries,
    resolveTarget: resolveScreenshotTarget,
    applyPreHooks: (command, info) => applyScreenshotPreHooks(command, info),
    captureScreenshot,
    testHelpers: { stripDataUrlPrefix },
  };
}

export { createHookRunner } from './hooks';

async function tryCaptureWithDomToImage(
  targetInfo: ScreenshotTargetInfo,
  quality: number
): Promise<{ ok: true; value: SweetLinkScreenshotResultData } | { ok: false; error: unknown }> {
  try {
    const result = await captureWithDomToImage(targetInfo, quality);
    return { ok: true, value: result };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}
