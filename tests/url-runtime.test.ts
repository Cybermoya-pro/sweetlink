import { describe, expect, it } from 'vitest';
import { buildWaitCandidateUrls, normalizeUrlForMatch, trimTrailingSlash, urlsRoughlyMatch } from '../src/runtime/url';

describe('runtime/url utilities', () => {
  it('normalizes URLs and tolerates invalid input', () => {
    expect(normalizeUrlForMatch('https://sweetistics.com/path')?.hostname).toBe('sweetistics.com');
    expect(normalizeUrlForMatch('not-a-url')).toBeNull();
    expect(normalizeUrlForMatch(undefined)).toBeNull();
  });

  it('trims trailing slashes but preserves root path', () => {
    expect(trimTrailingSlash('/timeline/home/')).toBe('/timeline/home');
    expect(trimTrailingSlash('///')).toBe('/');
    expect(trimTrailingSlash('')).toBe('/');
  });

  it('compares URLs loosely, allowing marketing suffixes', () => {
    expect(urlsRoughlyMatch('https://localhost:3000/timeline/home', 'https://localhost:3000/timeline/')).toBe(true);
    expect(urlsRoughlyMatch('https://localhost:3000/timeline/index', 'https://localhost:3000/timeline/')).toBe(true);
    expect(urlsRoughlyMatch('https://localhost:3000/settings/account', 'https://localhost:3000/insights')).toBe(false);
    expect(urlsRoughlyMatch('invalid-url', 'invalid-url')).toBe(true);
    expect(urlsRoughlyMatch('invalid-url', 'another')).toBe(false);
  });

  it('builds wait candidates including timeline and auth fallbacks', () => {
    const candidates = buildWaitCandidateUrls('http://localhost:3000/?sweetlink=auto');
    expect(candidates).toEqual(
      expect.arrayContaining([
        'http://localhost:3000/',
        'http://localhost:3000/?sweetlink=auto',
        'http://localhost:3000/timeline',
        'http://localhost:3000/timeline/home',
        'http://localhost:3000/timeline/index',
        'http://localhost:3000/timeline/overview',
        'http://localhost:3000/auth/signin',
      ])
    );

    const authCandidates = buildWaitCandidateUrls('https://app.sweetistics.com/auth');
    expect(authCandidates).toContain('https://app.sweetistics.com/auth/signin');

    const aliasCandidates = buildWaitCandidateUrls('https://app.sweetistics.com/insights?tab=main', [
      'https://app.sweetistics.com/insights',
      'https://app.sweetistics.com/insights/overview',
    ]);
    expect(aliasCandidates).toEqual(
      expect.arrayContaining(['https://app.sweetistics.com/insights', 'https://app.sweetistics.com/insights/overview'])
    );
  });
});
