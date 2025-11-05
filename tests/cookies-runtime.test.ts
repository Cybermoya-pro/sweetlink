import { describe, expect, it } from 'vitest';
import { buildCookieOrigins, normalizePuppeteerCookie } from '../src/runtime/cookies';

describe('runtime/cookies utilities', () => {
  it('builds cookie origins with Sweetistics fallbacks for local targets', () => {
    const origins = buildCookieOrigins('http://localhost:3000/timeline/home');
    expect(origins).toEqual(
      expect.arrayContaining([
        'http://localhost:3000',
        'https://sweetistics.com',
        'https://www.sweetistics.com',
        'https://app.sweetistics.com',
        'https://auth.sweetistics.com',
        'https://twitter.com',
        'https://api.twitter.com',
      ])
    );

    const remoteOrigins = buildCookieOrigins('https://app.sweetistics.com/timeline/home');
    expect(remoteOrigins).toEqual(expect.arrayContaining(['https://app.sweetistics.com', 'https://twitter.com']));
  });

  it('normalizes puppeteer cookies and rehomes Sweetistics auth tokens for local targets', () => {
    const targetBase = new URL('http://localhost:3000/timeline');
    const sourceBase = new URL('https://sweetistics.com/');
    const cookie = normalizePuppeteerCookie(
      {
        name: '__Secure-better-auth.session-token',
        value: 'abcd',
        domain: '.sweetistics.com',
        path: '/',
        sameSite: 'None',
        secure: true,
      },
      { sourceBase, targetBase }
    );

    expect(cookie).toEqual(
      expect.objectContaining({
        name: 'better-auth.session-token',
        url: 'http://localhost:3000',
        path: '/',
        sameSite: 'Lax',
        secure: false,
      })
    );
  });

  it('respects explicit secure and SameSite flags for non-local targets', () => {
    const targetBase = new URL('https://app.sweetistics.com/timeline');
    const sourceBase = new URL('https://app.sweetistics.com/');
    const cookie = normalizePuppeteerCookie(
      {
        name: 'twid',
        value: 'abc',
        domain: '.twitter.com',
        path: '/auth',
        secure: true,
        sameSite: 'Lax',
      },
      { sourceBase, targetBase }
    );

    expect(cookie).toEqual(
      expect.objectContaining({
        name: 'twid',
        domain: '.twitter.com',
        path: '/auth',
        secure: true,
        sameSite: 'Lax',
      })
    );
  });
});
