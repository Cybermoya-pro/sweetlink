import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/config-file', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/config-file')>('../../src/core/config-file');
  return {
    ...actual,
    loadSweetLinkFileConfig: vi.fn(),
  };
});

const { loadSweetLinkFileConfig } = await import('../../src/core/config-file');
const mockedLoadConfig = vi.mocked(loadSweetLinkFileConfig);
const { buildCookieOrigins } = await import('../../src/runtime/cookies');

const MOCK_EMPTY = { path: null, config: {} };

describe('buildCookieOrigins', () => {
  beforeEach(() => {
    mockedLoadConfig.mockReset();
    mockedLoadConfig.mockReturnValue(MOCK_EMPTY);
  });

  it('returns only the target origin when no mappings are configured', () => {
    expect(buildCookieOrigins('https://demo.example.com/path')).toEqual(['https://demo.example.com']);
  });

  it('includes configured origins when host matches exactly', () => {
    mockedLoadConfig.mockReturnValue({
      path: '/mock/config.json',
      config: {
        cookieMappings: [
          {
            hosts: ['sweetistics.com'],
            origins: ['https://api.twitter.com', 'https://x.com'],
          },
        ],
      },
    });

    expect(buildCookieOrigins('https://sweetistics.com/timeline')).toEqual([
      'https://sweetistics.com',
      'https://api.twitter.com',
      'https://x.com',
    ]);
  });

  it('matches subdomains and lower-cases hosts', () => {
    mockedLoadConfig.mockReturnValue({
      path: '/mock/config.json',
      config: {
        cookieMappings: [
          {
            hosts: ['Sweetistics.com'],
            origins: ['https://login.example.test'],
          },
        ],
      },
    });

    expect(buildCookieOrigins('https://app.sweetistics.com/dashboard')).toEqual([
      'https://app.sweetistics.com',
      'https://login.example.test',
    ]);
  });
});
