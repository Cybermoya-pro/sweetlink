import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevToolsConsoleEntry, SweetLinkBootstrapDiagnostics } from '../src/runtime/devtools';

vi.mock('playwright-core', () => ({
  chromium: {
    connect: vi.fn(),
  },
}));

vi.mock('undici', () => ({ WebSocket: class {} }));

const devtoolsModule = await import('../src/runtime/devtools');
const { logBootstrapDiagnostics, diagnosticsContainBlockingIssues, logDevtoolsConsoleSummary } = devtoolsModule;

describe('runtime/devtools diagnostics logging', () => {
  const captured: string[] = [];
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captured.length = 0;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((message?: unknown) => {
      if (typeof message === 'string') {
        captured.push(message);
      }
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('logs a concise summary with auth hints, overlay details, and route errors', () => {
    const diagnostics: SweetLinkBootstrapDiagnostics = {
      readyState: 'loading',
      autoFlag: true,
      bootstrapEmits: 3,
      sessionStorageAuto: 'pending',
      errors: [
        {
          type: 'auth-fetch',
          message: 'Authentication required for /api/auth/session',
          status: 401,
          source: 'auth.ts',
        },
        {
          type: 'error',
          message: 'Unhandled runtime exception',
          source: '/app/page.tsx',
          stack: 'Error: boom\n    at render (app/page.tsx:12:4)',
        },
      ],
      overlayText: 'Build Error\n   Error evaluating Node.js code',
      nextRouteError: { message: 'Route failed to load', digest: 'abcd1234' },
    };

    logBootstrapDiagnostics('SweetLink smoke', diagnostics);

    expect(captured[0]).toContain('SweetLink smoke document=loading');
    expect(captured).toContainEqual(
      expect.stringContaining('Detected 1 authentication failure while loading the page.')
    );
    expect(captured).toContainEqual(expect.stringContaining('auth status=401 (auth.ts): Authentication required'));
    expect(captured).toContainEqual(
      expect.stringContaining('SweetLink smoke console error (/app/page.tsx): Unhandled runtime exception')
    );
    expect(captured).toContainEqual(expect.stringContaining('SweetLink smoke Next.js overlay:'));
    expect(captured).toContainEqual(expect.stringContaining('SweetLink smoke route error: Route failed to load'));
  });

  it('summarises console entries and filters benign logs', () => {
    const entries: DevToolsConsoleEntry[] = [
      {
        ts: Date.now() - 1000,
        type: 'log',
        text: '[Fast Refresh] rebuilding',
        args: [],
      },
      {
        ts: Date.now(),
        type: 'error',
        text: 'Unhandled rejection Error: SweetLink auto-activation failed',
        args: ['Unhandled rejection Error: SweetLink auto-activation failed'],
      },
    ];

    logDevtoolsConsoleSummary('SweetLink smoke', entries, 5);

    expect(captured).toContainEqual(expect.stringContaining('SweetLink smoke: showing 1 error/warn console event'));
    expect(captured).toContainEqual(
      expect.stringContaining('Unhandled rejection Error: SweetLink auto-activation failed')
    );
  });
});

describe('diagnosticsContainBlockingIssues', () => {
  it('returns true when overlays, route errors, or auth failures are present', () => {
    expect(
      diagnosticsContainBlockingIssues({
        overlayText: 'Build Error',
      })
    ).toBe(true);

    expect(
      diagnosticsContainBlockingIssues({
        nextRouteError: { message: 'Route failed', digest: '123' },
      })
    ).toBe(true);

    expect(
      diagnosticsContainBlockingIssues({
        errors: [{ type: 'auth-fetch', message: 'Authentication required', status: 401 }],
      })
    ).toBe(true);
  });

  it('ignores ignorable console noise and benign errors', () => {
    expect(
      diagnosticsContainBlockingIssues({
        errors: [{ type: 'log', message: 'Intentional break for SweetLink session test' }],
      })
    ).toBe(false);
  });
});
