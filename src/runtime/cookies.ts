import { cliEnv } from '../env';
import { describeUnknown } from '../util/errors';

export interface ChromeCookiesSecureModule {
  getCookiesPromised(url: string, format: 'object', profilePath?: string): Promise<Record<string, ChromeCookieEntry>>;
  getCookiesPromised(url: string, format: 'puppeteer', profilePath?: string): Promise<Record<string, unknown>[]>;
}

interface ChromeCookieEntry {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expirationDate?: number;
}

export interface PuppeteerCookieParam {
  name: string;
  value: string;
  url?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: number;
}

let tldPatchedForLocalhost: boolean = false;

/** Collects cookies from the main Chrome profile matching the provided URL. */
export async function collectChromeCookies(targetUrl: string): Promise<PuppeteerCookieParam[]> {
  await ensureTldPatchedForLocalhost();

  const secureModule = await loadChromeCookiesModule();
  if (!secureModule) {
    return [];
  }

  const profileOverride = cliEnv.chromeProfilePath ?? undefined;
  const origins = buildCookieOrigins(targetUrl);
  const collected = new Map<string, PuppeteerCookieParam>();
  const debugCookies = cliEnv.cookieDebug;
  const targetBaseUrl = new URL(targetUrl);
  if (debugCookies) {
    console.log('Cookie sync debug enabled.');
  }

  for (const origin of origins) {
    await collectCookiesForOrigin({
      origin,
      secureModule,
      profileOverride,
      collected,
      debugCookies,
      targetBaseUrl,
    });
  }

  pruneIncompatibleCookies(targetBaseUrl, collected);

  return [...collected.values()];
}

/** Collects cookies for each domain and groups them by the originating host. */
export async function collectChromeCookiesForDomains(
  domains: readonly (string | undefined)[]
): Promise<Record<string, PuppeteerCookieParam[]>> {
  await ensureTldPatchedForLocalhost();

  const secureModule = await loadChromeCookiesModule();
  if (!secureModule) {
    return {};
  }

  const profileOverride = cliEnv.chromeProfilePath ?? undefined;
  const debugCookies = cliEnv.cookieDebug;
  const results: Record<string, PuppeteerCookieParam[]> = {};

  for (const domainCandidate of domains) {
    if (!domainCandidate) {
      continue;
    }
    const domain = domainCandidate;
    const origins = normalizeDomainToOrigins(domain);
    const collected = new Map<string, PuppeteerCookieParam>();
    for (const originCandidate of origins) {
      if (!originCandidate) {
        continue;
      }
      const origin = originCandidate;
      await collectCookiesForOrigin({
        origin,
        secureModule,
        profileOverride,
        collected,
        debugCookies,
        targetBaseUrl: new URL(origin),
      });
    }
    const targetCandidate = origins.length > 0 ? origins[0] : domain;
    const targetBase = targetCandidate ? tryParseUrl(targetCandidate) : null;
    if (targetBase) {
      pruneIncompatibleCookies(targetBase, collected);
    }
    results[domain] = [...collected.values()];
  }

  return results;
}

/** Returns the full set of origins SweetLink cares about for authentication. */
export function buildCookieOrigins(targetUrl: string): string[] {
  const base = new URL(targetUrl);
  const origins = new Set<string>([base.origin]);
  const host = base.hostname;
  const isLocalTarget = host === 'localhost' || host === '127.0.0.1';
  const normalizedHost = host.toLowerCase();
  const isSweetisticsHost =
    normalizedHost === 'sweetistics.com' ||
    normalizedHost === 'www.sweetistics.com' ||
    normalizedHost.endsWith('.sweetistics.com');

  for (const origin of ['https://twitter.com', 'https://x.com', 'https://api.twitter.com']) {
    origins.add(origin);
  }
  if (isLocalTarget || isSweetisticsHost) {
    for (const origin of [
      'https://sweetistics.com',
      'https://www.sweetistics.com',
      'https://app.sweetistics.com',
      'https://auth.sweetistics.com',
    ]) {
      origins.add(origin);
    }
  }
  return [...origins];
}

interface CollectCookiesContext {
  origin: string;
  secureModule: ChromeCookiesSecureModule;
  profileOverride?: string;
  collected: Map<string, PuppeteerCookieParam>;
  debugCookies: boolean;
  targetBaseUrl: URL;
}

async function collectCookiesForOrigin({
  origin,
  secureModule,
  profileOverride,
  collected,
  debugCookies,
  targetBaseUrl,
}: CollectCookiesContext): Promise<void> {
  const cookieOrigin = origin.endsWith('/') ? origin : `${origin}/`;
  let sourceBaseUrl: URL | null = null;
  try {
    sourceBaseUrl = new URL(cookieOrigin);
  } catch {
    if (debugCookies) {
      console.log(`Skipping malformed cookie origin candidate ${cookieOrigin}`);
    }
    return;
  }
  const fallbackOrigins = deriveCookieOriginFallbacks(sourceBaseUrl);

  const attemptCookieRead = async (
    candidateOrigin: string,
    reason: 'primary' | 'fallback'
  ): Promise<'added' | 'empty' | 'parse-error' | 'failed'> => {
    if (debugCookies) {
      if (reason === 'primary') {
        console.log(`Reading Chrome cookies for ${candidateOrigin}`);
      } else {
        console.log(`Retrying cookie collection for ${cookieOrigin} using fallback ${candidateOrigin}`);
      }
    }
    try {
      let candidateBase: URL | null = null;
      try {
        candidateBase = new URL(candidateOrigin);
      } catch {
        candidateBase = null;
      }
      if (!candidateBase) {
        return 'parse-error';
      }
      sourceBaseUrl = candidateBase;
      const beforeSize = collected.size;
      const raw = (await secureModule.getCookiesPromised(candidateOrigin, 'puppeteer', profileOverride)) as
        | Record<string, unknown>[]
        | undefined;
      if (raw && raw.length > 0) {
        ingestChromeCookies(raw, candidateBase, targetBaseUrl, collected, candidateOrigin, debugCookies);
        return collected.size > beforeSize ? 'added' : 'empty';
      }
      return 'empty';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Could not parse domain from URI')) {
        if (reason === 'fallback' && debugCookies) {
          console.log(`Fallback cookie origin ${candidateOrigin} also failed: ${message}`);
        }
        return 'parse-error';
      }
      if (reason === 'primary') {
        console.warn(`Failed to read cookies from Chrome for ${candidateOrigin}:`, message);
        console.warn('If this persists, ensure Chrome is running and you are logged in, then rerun the command.');
      } else if (debugCookies) {
        console.log(`Fallback cookie origin ${candidateOrigin} also failed: ${message}`);
      }
      return 'failed';
    }
  };

  const primaryResult = await attemptCookieRead(cookieOrigin, 'primary');
  const shouldAttemptFallback =
    fallbackOrigins.length > 0 && (primaryResult === 'empty' || primaryResult === 'parse-error');
  if (!shouldAttemptFallback) {
    if (primaryResult === 'parse-error' && debugCookies) {
      console.log(`Giving up on cookie sync for ${cookieOrigin}; chrome-cookies-secure cannot parse the host.`);
    }
    return;
  }

  let sawParseError = primaryResult === 'parse-error';
  for (const fallbackOrigin of fallbackOrigins) {
    const result = await attemptCookieRead(fallbackOrigin, 'fallback');
    if (result === 'added') {
      return;
    }
    if (result === 'parse-error') {
      sawParseError = true;
    }
  }

  if (debugCookies) {
    const reasonMessage = sawParseError
      ? 'chrome-cookies-secure cannot parse the host.'
      : 'no cookies were found after fallback candidates.';
    console.log(`Giving up on cookie sync for ${cookieOrigin}; ${reasonMessage}`);
  }
}

function ingestChromeCookies(
  rawCookies: readonly Record<string, unknown>[],
  sourceBaseUrl: URL,
  targetBaseUrl: URL,
  collected: Map<string, PuppeteerCookieParam>,
  sourceOrigin: string,
  debug: boolean
): void {
  if (!rawCookies?.length) {
    return;
  }
  for (const cookie of rawCookies) {
    if (debug) {
      console.log(`Saw cookie ${describeUnknown(cookie.name, 'unknown')} from ${sourceOrigin}`);
    }
    const mapped = normalizePuppeteerCookie(cookie, {
      sourceBase: sourceBaseUrl,
      targetBase: targetBaseUrl,
    });
    if (!mapped) {
      continue;
    }
    const key = `${mapped.domain ?? mapped.url ?? sourceBaseUrl.origin}|${mapped.path ?? '/'}|${mapped.name}`;
    if (!collected.has(key)) {
      collected.set(key, mapped);
    }
  }
  if (debug) {
    console.log(`${collected.size} cookies captured so far after ${sourceOrigin}`);
  }
}

function deriveCookieOriginFallbacks(baseUrl: URL | null): string[] {
  if (!baseUrl) {
    return [];
  }
  const protocol = baseUrl.protocol || 'https:';
  const host = baseUrl.hostname;
  if (!host) {
    return [];
  }
  const candidates = new Set<string>();
  const originWithSlash = `${protocol}//${host}/`;
  if (host === 'localhost' || host === '127.0.0.1') {
    candidates.add(originWithSlash);
    candidates.add('http://localhost/');
    candidates.add('http://127.0.0.1/');
    candidates.add('https://localhost/');
    candidates.add('https://127.0.0.1/');
    if (host === 'localhost') {
      candidates.add(`${protocol}//${host}.localdomain/`);
    }
  }
  candidates.delete(`${baseUrl.origin}/`);
  return [...candidates];
}

function normalizeDomainToOrigins(domain: string): string[] {
  const trimmed = domain.trim();
  if (!trimmed) {
    return [];
  }
  const candidates = new Set<string>();
  const addCandidate = (value: string) => {
    try {
      const url = new URL(value);
      candidates.add(`${url.origin}/`);
    } catch {
      /* ignore malformed candidates */
    }
  };
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    addCandidate(trimmed);
  } else {
    addCandidate(`https://${trimmed}`);
    addCandidate(`http://${trimmed}`);
  }
  return [...candidates];
}

export function normalizePuppeteerCookie(
  cookie: Record<string, unknown>,
  bases: { sourceBase: URL; targetBase: URL }
): PuppeteerCookieParam | null {
  const originalName = typeof cookie.name === 'string' ? cookie.name : null;
  const value = typeof cookie.value === 'string' ? cookie.value : null;
  if (!originalName || value === null) {
    return null;
  }

  const result: PuppeteerCookieParam = {
    name: originalName,
    value,
  };

  const domain = typeof cookie.domain === 'string' && cookie.domain.length > 0 ? cookie.domain : null;
  const path = typeof cookie.path === 'string' && cookie.path.length > 0 ? cookie.path : '/';
  const targetHost = bases.targetBase.hostname;
  const isLocalTarget = targetHost === 'localhost' || targetHost === '127.0.0.1';
  const normalizedDomain = domain?.replace(/^\./, '') ?? null;
  const isSweetisticsDomain = normalizedDomain ? /(^|\.)sweetistics\.[a-z]+$/i.test(normalizedDomain) : false;
  const isLocalDomain =
    normalizedDomain === 'localhost' || normalizedDomain === '127.0.0.1' || normalizedDomain === '::1';

  if (isLocalTarget && result.name.startsWith('__Secure-better-auth.')) {
    result.name = result.name.replace(/^__Secure-/, '');
  }

  if (domain && domain !== 'localhost') {
    if (isLocalTarget && (isSweetisticsDomain || isLocalDomain)) {
      result.url = bases.targetBase.origin;
    } else {
      result.domain = domain;
    }
  } else {
    result.url = bases.targetBase.origin;
  }

  if (path) {
    result.path = path;
  }

  if (cookie.Secure === true || cookie.secure === true) {
    result.secure = true;
  }
  if (cookie.HttpOnly === true || cookie.httpOnly === true) {
    result.httpOnly = true;
  }

  const sameSiteSource = typeof cookie.sameSite === 'string' ? cookie.sameSite : undefined;
  const sameSite = normalizeSameSite(sameSiteSource);
  if (sameSite) {
    result.sameSite = sameSite;
  }
  if (sameSite === 'None' && !result.secure) {
    result.secure = true;
  }

  if (typeof cookie.expires === 'number' && Number.isFinite(cookie.expires) && cookie.expires > 0) {
    result.expires = Math.round(cookie.expires);
  }

  const rehomedToTarget =
    typeof result.url === 'string' && result.url.length > 0 && result.url === bases.targetBase.origin;
  if (rehomedToTarget && bases.targetBase.protocol === 'http:') {
    if (result.secure) {
      result.secure = false;
    }
    if (result.sameSite === 'None') {
      result.sameSite = 'Lax';
    }
    if (result.name.startsWith('__Secure-')) {
      result.name = result.name.replace(/^__Secure-/, '');
    }
    if (result.name.startsWith('__Host-')) {
      result.name = result.name.replace(/^__Host-/, '');
      result.path = '/';
    }
  }

  return result;
}

function normalizeSameSite(value?: string): 'Strict' | 'Lax' | 'None' | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'strict') {
    return 'Strict';
  }
  if (normalized === 'lax') {
    return 'Lax';
  }
  if (normalized === 'no_restriction' || normalized === 'none') {
    return 'None';
  }
  return undefined;
}

function pruneIncompatibleCookies(targetBaseUrl: URL, collected: Map<string, PuppeteerCookieParam>): void {
  if (collected.size === 0) {
    return;
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(targetBaseUrl.hostname)) {
    return;
  }

  const disallowedNames = new Set(['_vercel_session', '_vercel_jwt']);

  for (const [key, cookie] of collected.entries()) {
    const name = cookie.name?.toLowerCase();
    if (name && disallowedNames.has(name)) {
      collected.delete(key);
    }
  }
}

function tryParseUrl(candidate: string): URL | null {
  try {
    return new URL(candidate);
  } catch {
    try {
      return new URL(candidate.includes('://') ? candidate : `http://${candidate}`);
    } catch {
      return null;
    }
  }
}

async function ensureTldPatchedForLocalhost(): Promise<void> {
  if (tldPatchedForLocalhost) {
    return;
  }
  try {
    const importedModule: unknown = await import('tldjs');
    const tld = resolveTldModule(importedModule);
    if (tld && typeof tld.getDomain === 'function') {
      const originalGetDomain = tld.getDomain.bind(tld);
      tld.getDomain = (uri: string): string | null => {
        const domain = originalGetDomain(uri);
        if (domain) {
          return domain;
        }
        try {
          return new URL(uri).hostname ?? null;
        } catch {
          return null;
        }
      };
      tldPatchedForLocalhost = true;
    }
  } catch (error) {
    console.warn('Failed to patch tldjs for localhost support:', error);
  }
}

async function loadChromeCookiesModule(): Promise<ChromeCookiesSecureModule | null> {
  let imported: unknown;
  try {
    imported = await import('chrome-cookies-secure');
  } catch (error) {
    console.warn('Failed to load chrome-cookies-secure to copy cookies:', error);
    console.warn('If this persists, run `pnpm rebuild chrome-cookies-secure sqlite3 keytar --workspace-root`.');
    return null;
  }

  const secureModule = resolveChromeCookieModule(imported);
  if (!secureModule) {
    console.warn('chrome-cookies-secure does not expose getCookiesPromised(); skipping cookie copy.');
    return null;
  }
  return secureModule;
}

function resolveChromeCookieModule(candidate: unknown): ChromeCookiesSecureModule | null {
  if (hasGetCookiesPromised(candidate)) {
    return candidate;
  }
  if (typeof candidate === 'object' && candidate !== null) {
    const defaultExport: unknown = Reflect.get(candidate, 'default');
    if (hasGetCookiesPromised(defaultExport)) {
      return defaultExport;
    }
  }
  return null;
}

function hasGetCookiesPromised(value: unknown): value is ChromeCookiesSecureModule {
  return Boolean(value && typeof (value as ChromeCookiesSecureModule).getCookiesPromised === 'function');
}

type TldModuleWithGetDomain = { getDomain: (uri: string) => string | null };

function resolveTldModule(value: unknown): TldModuleWithGetDomain | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.getDomain === 'function') {
    return record as TldModuleWithGetDomain;
  }
  const defaultExport = record.default;
  if (typeof defaultExport === 'object' && defaultExport !== null) {
    const defaultRecord = defaultExport as Record<string, unknown>;
    if (typeof defaultRecord.getDomain === 'function') {
      return defaultRecord as TldModuleWithGetDomain;
    }
  }
  return null;
}
