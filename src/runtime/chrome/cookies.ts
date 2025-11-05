import { uniq } from 'es-toolkit';
import type { Browser as PuppeteerBrowser, Page as PuppeteerPage } from 'puppeteer';
import { sweetLinkDebug } from '../../env';
import { delay } from '../../util/time';
import { buildCookieOrigins, collectChromeCookies, type PuppeteerCookieParam } from '../cookies';
import { PUPPETEER_PROTOCOL_TIMEOUT_MS } from './constants';
import { attemptPuppeteerReload, navigatePuppeteerPage, resolvePuppeteerPage, waitForPageReady } from './puppeteer';

export async function primeControlledChromeCookies(options: {
  devtoolsUrl: string;
  targetUrl: string;
  reload: boolean;
  context: 'new-window' | 'existing-tab' | 'new-tab';
}): Promise<void> {
  const cookies = await collectChromeCookies(options.targetUrl);
  if (cookies.length === 0) {
    console.log('No Chrome cookies found for this origin; continuing without priming the controlled window.');
    return;
  }

  let puppeteer: typeof import('puppeteer').default | null = null;
  try {
    ({ default: puppeteer } = await import('puppeteer'));
  } catch (error) {
    console.warn('Unable to load Puppeteer while priming cookies:', error);
    return;
  }

  if (!puppeteer) {
    return;
  }

  let browser: PuppeteerBrowser | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      browser = await puppeteer.connect({
        browserURL: options.devtoolsUrl,
        defaultViewport: null,
        protocolTimeout: PUPPETEER_PROTOCOL_TIMEOUT_MS,
      });
      break;
    } catch (error) {
      if (attempt === 9) {
        console.warn('Unable to attach to controlled Chrome for cookie priming:', error);
        return;
      }
      await delay(200);
    }
  }

  if (!browser) {
    console.warn('Unable to attach to controlled Chrome for cookie priming: unknown error');
    return;
  }

  try {
    let page = await resolvePuppeteerPage(browser, options.targetUrl);
    if (!page) {
      const fallbackPage = await browser.newPage();
      const navigated = await navigatePuppeteerPage(fallbackPage, options.targetUrl, 3);
      if (!navigated) {
        console.warn('Unable to locate or recreate the controlled tab while priming cookies.');
        await fallbackPage.close().catch(() => {
          /* ignored */
        });
        return;
      }
      page = fallbackPage;
    }

    await waitForPageReady(page);
    await (page.setCookie as (...args: unknown[]) => Promise<void>)(...cookies);
    await verifyCookieSync(page, options.targetUrl, cookies);

    if (options.reload) {
      await attemptPuppeteerReload(page);
    }

    let contextLabel = 'controlled window';
    if (options.context === 'existing-tab') {
      contextLabel = 'existing controlled tab';
    } else if (options.context === 'new-tab') {
      contextLabel = 'controlled tab';
    }
    console.log(
      `Copied ${cookies.length} cookie${cookies.length === 1 ? '' : 's'} from your main Chrome profile into the ${contextLabel}${options.reload ? ' and refreshed the tab to apply the session.' : '.'}`
    );
    const cookieNames = cookies
      .map((cookie) => (typeof cookie.name === 'string' ? cookie.name : null))
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
    if (cookieNames.length > 0) {
      const authCookies = uniq(cookieNames.filter((name) => /auth|session|token/i.test(name)));
      if (authCookies.length > 0) {
        console.log(`Detected likely auth cookies: ${authCookies.join(', ')}.`);
      } else {
        console.log('No obvious auth/session cookies detected—expect to re-authenticate in the controlled window.');
      }
      const hasHttpOnly = cookies.some((cookie) => Boolean(cookie.httpOnly));
      console.log(
        `HttpOnly cookies present: ${hasHttpOnly ? 'yes' : 'no'} (Chrome may restrict visibility inside the page).`
      );
    }
    if (!options.reload && options.context === 'existing-tab') {
      console.log('Hint: reload the tab if the session has not updated yet.');
    }
  } catch (error) {
    console.warn('Failed to apply Chrome cookies to the controlled window:', error);
  } finally {
    try {
      await browser.disconnect();
    } catch (disconnectError) {
      if (sweetLinkDebug) {
        console.warn('Unable to disconnect Puppeteer browser after cookie sync.', disconnectError);
      }
    }
  }
}

async function verifyCookieSync(
  page: PuppeteerPage,
  targetUrl: string,
  attempted: PuppeteerCookieParam[]
): Promise<void> {
  if (attempted.length === 0) {
    return;
  }
  try {
    const appliedNames = new Set<string>();
    const origins = buildCookieOrigins(targetUrl);
    for (const origin of origins) {
      try {
        const cookies = await page.cookies(origin);
        for (const cookie of cookies) {
          appliedNames.add(cookie.name);
        }
      } catch {
        /* ignore per-origin failures */
      }
    }
    const missing = attempted.filter((cookie) => !appliedNames.has(cookie.name));
    if (missing.length > 0) {
      const missingNames = missing.map((cookie) => cookie.name).join(', ');
      console.warn(`Warning: the controlled window is missing ${missing.length} cookie(s) (${missingNames}).`);
    }
  } catch (error) {
    console.warn('Unable to verify cookie sync in the controlled window:', error);
  }
}
