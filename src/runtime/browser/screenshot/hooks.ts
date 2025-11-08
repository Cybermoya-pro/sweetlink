import type { SweetLinkScreenshotCommand } from '@sweetlink/shared';
import { loadDefaultExportFromUrl } from '../module-loader.js';
import type { ScreenshotTargetInfo } from '../types.js';
import { getBrowserWindow } from '../utils/environment.js';
import { clamp } from '../utils/number.js';
import { isRecord, toTrimmedNonEmptyString } from '../utils/object.js';

type HookRunner = (clientWindow: Window, document_: Document, target: HTMLElement) => Promise<void> | void;

export type ScreenshotHook =
  | {
      readonly type: 'scrollIntoView';
      readonly selector?: string | null;
      readonly behavior?: ScrollBehavior;
      readonly block?: ScrollLogicalPosition;
    }
  | {
      readonly type: 'waitForSelector';
      readonly selector: string;
      readonly visibility?: 'any' | 'visible';
      readonly timeoutMs?: number;
    }
  | {
      readonly type: 'waitForIdle';
      readonly timeoutMs?: number;
      readonly frameCount?: number;
    }
  | {
      readonly type: 'wait';
      readonly ms: number;
    }
  | {
      readonly type: 'script';
      readonly code: string;
    };

export const isScreenshotHook = (candidate: unknown): candidate is ScreenshotHook => {
  const record = isRecord<{ type?: unknown; selector?: unknown; ms?: unknown; code?: unknown }>(candidate)
    ? candidate
    : null;
  if (!record || typeof record.type !== 'string') {
    return false;
  }
  switch (record.type) {
    case 'scrollIntoView': {
      const selectorValid =
        record.selector === undefined || record.selector === null || typeof record.selector === 'string';
      return selectorValid;
    }
    case 'waitForSelector': {
      return typeof record.selector === 'string';
    }
    case 'waitForIdle': {
      return true;
    }
    case 'wait': {
      return typeof record.ms === 'number' && Number.isFinite(record.ms);
    }
    case 'script': {
      return typeof record.code === 'string';
    }
    default: {
      return false;
    }
  }
};

export const createHookRunner = (source: string): HookRunner => {
  const blob = new Blob(['"use strict"; export default async (window, document, target) => {\n', source, '\n};'], {
    type: 'text/javascript',
  });

  const blobUrl = URL.createObjectURL(blob);
  let compiledRunnerPromise: Promise<HookRunner> | null = null;

  const loadRunner = async (): Promise<HookRunner> => {
    if (!compiledRunnerPromise) {
      compiledRunnerPromise = loadDefaultExportFromUrl<HookRunner>(blobUrl)
        .catch((error: unknown) => {
          throw error instanceof Error ? error : new Error(String(error));
        })
        .finally(() => {
          URL.revokeObjectURL(blobUrl);
        });
    }
    return compiledRunnerPromise;
  };

  return async (clientWindow, document_, target) => {
    const runner = await loadRunner();
    await runner(clientWindow, document_, target);
  };
};

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
  if (!isRecord<{ then?: unknown }>(value)) {
    return false;
  }
  return typeof value.then === 'function';
};

export async function applyScreenshotPreHooks(
  command: SweetLinkScreenshotCommand,
  initialTarget: ScreenshotTargetInfo
): Promise<void> {
  const hooks: readonly ScreenshotHook[] = Array.isArray(command.hooks)
    ? command.hooks.filter((hook): hook is ScreenshotHook => isScreenshotHook(hook))
    : [];
  if (hooks.length === 0) {
    return;
  }

  const runHook = async (hook: ScreenshotHook): Promise<void> => {
    switch (hook.type) {
      case 'scrollIntoView': {
        const target = resolveHookTarget(hook.selector, command.selector, initialTarget.target);
        target.scrollIntoView({
          behavior: hook.behavior ?? 'auto',
          block: hook.block ?? 'center',
        });
        await waitForIdle({ frameCount: 1, timeoutMs: 2000 });
        return;
      }
      case 'waitForSelector': {
        await waitForSelectorHook(hook.selector, {
          visibility: hook.visibility ?? 'any',
          timeoutMs: hook.timeoutMs ?? 10_000,
        });
        return;
      }
      case 'waitForIdle': {
        await waitForIdle({
          frameCount: hook.frameCount ?? 1,
          timeoutMs: hook.timeoutMs ?? 3000,
        });
        return;
      }
      case 'wait': {
        await delay(Math.max(0, hook.ms));
        return;
      }
      case 'script': {
        await runHookScript(hook.code, initialTarget.target);
        return;
      }
      default: {
        /* ignore unsupported hook */
        return;
      }
    }
  };

  let hookChain = Promise.resolve();
  for (const hook of hooks) {
    hookChain = hookChain.then(() => runHook(hook));
  }

  await hookChain;
}

function resolveHookTarget(
  hookSelector: string | null | undefined,
  commandSelector: string | null | undefined,
  fallback: HTMLElement
): HTMLElement {
  const selector = hookSelector ?? commandSelector ?? null;
  if (!selector) {
    return fallback;
  }
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Pre-capture hook target not found for selector "${selector}"`);
  }
  if (!(element instanceof HTMLElement)) {
    throw new TypeError(`Pre-capture hook selector "${selector}" did not resolve to an HTMLElement`);
  }
  return element;
}

async function waitForSelectorHook(
  selector: string,
  options: { visibility: 'any' | 'visible'; timeoutMs: number }
): Promise<HTMLElement> {
  const deadline = performance.now() + options.timeoutMs;

  const poll = async (): Promise<HTMLElement> => {
    const match = document.querySelector(selector);
    if (match instanceof HTMLElement) {
      if (options.visibility === 'visible') {
        const rect = match.getBoundingClientRect();
        const style = getComputedStyle(match);
        if (rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none') {
          return match;
        }
      } else {
        return match;
      }
    }

    if (performance.now() > deadline) {
      throw new Error(`Timeout waiting for selector "${selector}" (${options.visibility})`);
    }

    await waitForAnimationFrame();
    return poll();
  };

  return poll();
}

async function waitForIdle(options: { frameCount: number; timeoutMs: number }): Promise<void> {
  const deadline = performance.now() + options.timeoutMs;
  const waitFrames = async (remaining: number): Promise<void> => {
    if (remaining <= 0) {
      return;
    }
    await waitForAnimationFrame();
    if (performance.now() > deadline) {
      console.warn(
        '[SweetLink] waitForIdle timed out before reaching the requested frame count; proceeding with current frame.'
      );
      return;
    }
    await waitFrames(remaining - 1);
  };

  await waitFrames(Math.max(1, options.frameCount));
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow || typeof browserWindow.requestAnimationFrame !== 'function') {
      setTimeout(() => {
        resolve();
      }, 16);
      return;
    }
    browserWindow.requestAnimationFrame(() => {
      resolve();
    });
  });
}

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, clamp(ms, 0, Number.POSITIVE_INFINITY)));
};

async function runHookScript(code: string, target: HTMLElement): Promise<void> {
  const normalizedCode = toTrimmedNonEmptyString(code);
  if (!normalizedCode) {
    return;
  }
  const runner = createHookRunner(normalizedCode);
  const result = runner(getBrowserWindow() ?? window, document, target);
  if (isPromiseLike(result)) {
    await result;
  }
}
