import { sweetLinkDebug } from '../../env';
import { delay } from '../../util/time';
import { urlsRoughlyMatch } from '../url';
import { evaluateInDevToolsTab, fetchDevToolsTabsWithRetry } from './cdp';
import { PUPPETEER_CONNECT_TIMEOUT_MS } from './constants';
const isTwitterOauthUrl = (url) => {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host.endsWith('twitter.com') || host.endsWith('x.com');
    }
    catch {
        return false;
    }
};
export async function attemptTwitterOauthAutoAccept(params) {
    const collectCandidateUrls = async () => {
        const urls = new Set();
        const addCandidate = (url) => {
            if (!url) {
                return;
            }
            urls.add(url);
        };
        addCandidate(params.sessionUrl);
        try {
            const tabs = await fetchDevToolsTabsWithRetry(params.devtoolsUrl);
            for (const tab of tabs) {
                if (!tab?.url) {
                    continue;
                }
                if (urlsRoughlyMatch(tab.url, params.sessionUrl)) {
                    addCandidate(tab.url);
                    continue;
                }
                if (isTwitterOauthUrl(tab.url) || tab.url.toLowerCase().includes('oauth')) {
                    addCandidate(tab.url);
                }
            }
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('Failed to inspect DevTools tabs for OAuth auto-accept:', error);
            }
        }
        return [...urls];
    };
    const expression = `(() => {
    const buttonTexts = ["authorize app", "allow", "authorize", "accept"];
    const host = location.hostname.toLowerCase();
    const result = {
      url: location.href,
      host,
      handled: false,
      reason: null,
      action: null,
      clickedText: null,
      hasUsernameInput: false,
      hasPasswordInput: false,
    };
    const isTwitterHost = host.endsWith('twitter.com') || host.endsWith('x.com');
    if (!isTwitterHost) {
      result.reason = 'not-twitter';
      return result;
    }
    const usernameSelectors = [
      'input[name="session[username_or_email]"]',
      'input[name="text"]',
      'input[autocomplete="username"]',
      'input[data-testid="LoginForm_User_Field"]',
    ];
    const passwordSelectors = [
      'input[name="session[password]"]',
      'input[type="password"]',
      'input[data-testid="LoginForm_Password_Field"]',
    ];
    if (usernameSelectors.some((selector) => document.querySelector(selector)) ||
        passwordSelectors.some((selector) => document.querySelector(selector))) {
      result.reason = 'requires-login';
      result.hasUsernameInput = usernameSelectors.some((selector) => document.querySelector(selector));
      result.hasPasswordInput = passwordSelectors.some((selector) => document.querySelector(selector));
      return result;
    }
    const formSelectors = ['form[action*="oauth" i]', 'form[action*="authorize" i]', 'form[action*="oauth/authorize" i]'];
    const buttonTestIds = [
      'oauthauthorizebutton',
      'oauth-allow',
      'oauth-authorize',
      'oauth-approve',
      'authorizeappbutton',
      'app-bar-allow-button',
      'allow',
      'approve'
    ];
    const isMatch = (element) => {
      if (!element) {
        return false;
      }
    const testId = (element.getAttribute?.('data-testid') ?? '').trim().toLowerCase();
      if (testId && buttonTestIds.includes(testId)) {
        return true;
      }
      const text = (element.textContent || '').trim().toLowerCase();
      if (text.length === 0 && element.tagName === 'INPUT') {
        const value = (element.value || '').trim().toLowerCase();
        return buttonTexts.includes(value);
      }
      return buttonTexts.includes(text);
    };
    const buttonElements = Array.from(
      document.querySelectorAll('button, div[role="button"], a[role="button"], input[type="submit"]')
    );
    let target = buttonElements.find((candidate) => isMatch(candidate)) || null;
    if (!target) {
      const forms = formSelectors
        .map((selector) => Array.from(document.querySelectorAll(selector)))
        .flat();
      let fallbackForm = null;
      for (const form of forms) {
        const submitCandidate = form.querySelector('button, input[type="submit"], div[role="button"], a[role="button"]');
        if (isMatch(submitCandidate)) {
          target = submitCandidate;
          break;
        }
        if (!fallbackForm) {
          fallbackForm = form;
        }
      }
      if (!target && fallbackForm) {
        target = fallbackForm;
      }
    }
    if (!target) {
      result.reason = 'button-not-found';
      return result;
    }
    const clickable = target;
    const parentForm = typeof clickable.closest === 'function' ? clickable.closest('form') : null;
    let handled = false;
    if (typeof clickable.click === 'function') {
      try {
        clickable.click();
        const raw = (clickable.textContent ?? (clickable as HTMLInputElement).value ?? '').trim();
        result.handled = true;
        result.action = 'click';
        result.clickedText = raw || null;
        return result;
      } catch {
        /* ignore */
      }
    }
    try {
      const ownerView = clickable.ownerDocument?.defaultView ?? undefined;
      const synthetic = new MouseEvent('click', { bubbles: true, cancelable: true, view: ownerView });
      if (clickable.dispatchEvent(synthetic)) {
        const raw = (clickable.textContent ?? (clickable as HTMLInputElement).value ?? '').trim();
        result.handled = true;
        result.action = 'dispatch-event';
        result.clickedText = raw || null;
        return result;
      }
    } catch {
      /* ignore */
    }
    if (parentForm) {
      try {
        if (typeof parentForm.requestSubmit === 'function') {
          parentForm.requestSubmit(clickable instanceof HTMLButtonElement ? clickable : undefined);
        } else {
          parentForm.submit();
        }
        const raw = (clickable.textContent ?? (clickable as HTMLInputElement).value ?? '').trim();
        result.handled = true;
        result.action = 'form-submit';
        result.clickedText = raw || null;
        return result;
      } catch {
        /* ignore */
      }
    }
    result.reason = 'button-not-clickable';
    return result;
  })();`;
    let lastResult = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidateUrls = await collectCandidateUrls();
        let attemptedEvaluation = false;
        for (const candidateUrl of candidateUrls) {
            attemptedEvaluation = true;
            try {
                const raw = await evaluateInDevToolsTab(params.devtoolsUrl, candidateUrl, expression);
                if (typeof raw !== 'object' || raw === null) {
                    if (sweetLinkDebug) {
                        console.warn('OAuth auto-accept returned non-object payload:', raw);
                    }
                    lastResult = { handled: false, reason: 'invalid-response' };
                    continue;
                }
                const record = raw;
                if (record.handled === true) {
                    const recordAction = record.action;
                    const action = typeof recordAction === 'string' ? recordAction : 'click';
                    const clickedText = typeof record.clickedText === 'string' ? record.clickedText : null;
                    return { handled: true, action, clickedText };
                }
                const recordReason = record.reason;
                const reason = typeof recordReason === 'string' ? recordReason : 'unknown';
                lastResult = {
                    handled: false,
                    reason,
                    hasUsernameInput: record.hasUsernameInput === true,
                    hasPasswordInput: record.hasPasswordInput === true,
                };
                if (reason === 'requires-login') {
                    return lastResult;
                }
            }
            catch (error) {
                if (sweetLinkDebug) {
                    console.warn('OAuth auto-accept evaluation failed:', error);
                }
            }
        }
        if (!attemptedEvaluation || candidateUrls.length === 0) {
            await delay(500);
            continue;
        }
        if (lastResult?.reason === 'not-twitter' || lastResult?.reason === 'button-not-found') {
            await delay(500);
            continue;
        }
        break;
    }
    if (!lastResult?.handled) {
        const puppeteerResult = await attemptTwitterOauthAutoAcceptWithPuppeteer(params);
        if (puppeteerResult) {
            if (puppeteerResult.handled) {
                return puppeteerResult;
            }
            lastResult = puppeteerResult;
        }
    }
    return lastResult ?? { handled: false, reason: 'button-not-found' };
}
async function attemptTwitterOauthAutoAcceptWithPuppeteer(params) {
    let puppeteer;
    try {
        ({ default: puppeteer } = await import('puppeteer'));
    }
    catch (error) {
        if (sweetLinkDebug) {
            console.warn('OAuth auto-accept fallback: unable to load Puppeteer.', error);
        }
        return null;
    }
    let browser = null;
    for (let attempt = 0; attempt < 3 && !browser; attempt += 1) {
        try {
            browser = await puppeteer.connect({
                browserURL: params.devtoolsUrl,
                defaultViewport: null,
                protocolTimeout: PUPPETEER_CONNECT_TIMEOUT_MS,
            });
        }
        catch (error) {
            if (attempt === 2) {
                if (sweetLinkDebug) {
                    console.warn('OAuth auto-accept fallback: unable to attach to controlled Chrome.', error);
                }
                return null;
            }
            await delay(250);
        }
    }
    if (!browser) {
        return null;
    }
    try {
        const pages = await browser.pages();
        if (pages.length === 0) {
            return null;
        }
        const candidatePages = pages.filter((page) => {
            const url = page.url();
            if (!url) {
                return false;
            }
            return urlsRoughlyMatch(url, params.sessionUrl) || isTwitterOauthUrl(url) || url.toLowerCase().includes('oauth');
        });
        const pagesToInspect = candidatePages.length > 0 ? candidatePages : pages;
        let lastResult = null;
        for (const page of pagesToInspect) {
            const pageResult = await authorizeTwitterOauthInPage(page);
            if (!pageResult) {
                continue;
            }
            if (pageResult.handled) {
                try {
                    await Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null),
                        delay(1500),
                    ]);
                }
                catch {
                    /* ignore navigation waits */
                }
                return { handled: true, action: 'puppeteer-click', clickedText: pageResult.clickedText };
            }
            lastResult = pageResult;
            if (pageResult.reason === 'requires-login') {
                return lastResult;
            }
        }
        return lastResult;
    }
    catch (error) {
        if (sweetLinkDebug) {
            console.warn('OAuth auto-accept fallback: unexpected Puppeteer failure.', error);
        }
        return null;
    }
    finally {
        try {
            await browser.disconnect();
        }
        catch {
            /* ignore disconnect errors */
        }
    }
}
async function authorizeTwitterOauthInPage(page) {
    const frames = page.frames();
    let lastResult = null;
    for (const frame of frames) {
        let frameResult = null;
        try {
            frameResult = await frame.evaluate(twitterOauthAuthorizeEvaluator);
        }
        catch (error) {
            if (sweetLinkDebug) {
                console.warn('OAuth auto-accept fallback: frame evaluation failed.', error);
            }
        }
        if (!frameResult) {
            continue;
        }
        if (frameResult.handled) {
            return frameResult;
        }
        lastResult = frameResult;
        if (frameResult.reason === 'requires-login') {
            return lastResult;
        }
    }
    return lastResult;
}
const twitterOauthAuthorizeEvaluator = () => {
    const result = {
        handled: false,
        clickedText: null,
    };
    const host = location.hostname.toLowerCase();
    const isTwitterHost = host.endsWith('twitter.com') || host.endsWith('x.com');
    if (!isTwitterHost) {
        result.reason = 'not-twitter';
        return result;
    }
    const usernameSelectors = [
        'input[name="session[username_or_email]"]',
        'input[name="text"]',
        'input[autocomplete="username"]',
        'input[data-testid="LoginForm_User_Field"]',
    ];
    const passwordSelectors = [
        'input[name="session[password]"]',
        'input[type="password"]',
        'input[data-testid="LoginForm_Password_Field"]',
    ];
    const loginDetected = usernameSelectors.some((selector) => document.querySelector(selector)) ||
        passwordSelectors.some((selector) => document.querySelector(selector));
    if (loginDetected) {
        result.reason = 'requires-login';
        result.hasUsernameInput = usernameSelectors.some((selector) => document.querySelector(selector));
        result.hasPasswordInput = passwordSelectors.some((selector) => document.querySelector(selector));
        return result;
    }
    const buttonTexts = ['authorize app', 'allow', 'authorize', 'accept'];
    const buttonTestIds = [
        'oauthauthorizebutton',
        'oauth-allow',
        'oauth-authorize',
        'oauth-approve',
        'authorizeappbutton',
        'app-bar-allow-button',
        'allow',
        'approve',
    ];
    const matchButton = (element) => {
        if (!element) {
            return null;
        }
        const testId = (element.getAttribute?.('data-testid') ?? '').trim().toLowerCase();
        if (testId && buttonTestIds.includes(testId)) {
            return element;
        }
        const text = (element.textContent || '').trim().toLowerCase();
        if (text.length === 0 && element.tagName === 'INPUT') {
            const value = element.value.trim().toLowerCase();
            return buttonTexts.includes(value) ? element : null;
        }
        return buttonTexts.includes(text) ? element : null;
    };
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"], input[type="submit"]'));
    let target = buttons.map((candidate) => matchButton(candidate)).find((candidate) => Boolean(candidate)) ??
        null;
    if (!target) {
        const forms = Array.from(document.querySelectorAll('form[action*="oauth" i], form[action*="authorize" i], form[action*="oauth/authorize" i]'));
        let fallbackForm = null;
        for (const form of forms) {
            const submitCandidate = matchButton(form.querySelector('button, input[type="submit"], div[role="button"], a[role="button"]'));
            if (submitCandidate) {
                target = submitCandidate;
                break;
            }
            if (!fallbackForm) {
                fallbackForm = form;
            }
        }
        if (!target && fallbackForm) {
            target = fallbackForm;
        }
    }
    if (!target) {
        result.reason = 'button-not-found';
        return result;
    }
    try {
        if (typeof target.click === 'function') {
            target.click();
            const raw = (target.textContent ?? target.value ?? '').trim();
            result.handled = true;
            result.action = 'click';
            result.clickedText = raw || null;
            return result;
        }
    }
    catch {
        /* ignore */
    }
    try {
        const ownerView = target.ownerDocument?.defaultView ?? undefined;
        const synthetic = new MouseEvent('click', { bubbles: true, cancelable: true, view: ownerView });
        if (target.dispatchEvent(synthetic)) {
            const raw = (target.textContent ?? target.value ?? '').trim();
            result.handled = true;
            result.action = 'dispatch-event';
            result.clickedText = raw || null;
            return result;
        }
    }
    catch {
        /* ignore */
    }
    const parentForm = target.closest('form');
    if (parentForm) {
        try {
            if (typeof parentForm.requestSubmit === 'function') {
                parentForm.requestSubmit(target instanceof HTMLButtonElement ? target : undefined);
            }
            else {
                parentForm.submit();
            }
            const raw = (target.textContent ?? target.value ?? '').trim();
            result.handled = true;
            result.action = 'form-submit';
            result.clickedText = raw || null;
            return result;
        }
        catch {
            /* ignore */
        }
    }
    result.reason = loginDetected ? 'requires-login' : 'button-not-clickable';
    return result;
};
//# sourceMappingURL=oauth.js.map