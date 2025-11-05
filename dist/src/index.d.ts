#!/usr/bin/env node
import { prepareChromeLaunch } from './runtime/chrome';
import { buildCookieOrigins, collectChromeCookies, normalizePuppeteerCookie } from './runtime/cookies';
import { deriveDevtoolsLinkInfo } from './runtime/devtools';
import { buildClickScript } from './runtime/session';
import { buildWaitCandidateUrls } from './runtime/url';
export declare function formatPathForDisplay(value: string): string;
export declare const __sweetlinkCliTestHelpers: {
    collectChromeCookies: typeof collectChromeCookies;
    normalizePuppeteerCookie: typeof normalizePuppeteerCookie;
    buildCookieOrigins: typeof buildCookieOrigins;
    prepareChromeLaunch: typeof prepareChromeLaunch;
    buildWaitCandidateUrls: typeof buildWaitCandidateUrls;
    deriveDevtoolsLinkInfo: typeof deriveDevtoolsLinkInfo;
    buildClickScript: typeof buildClickScript;
};
export { diagnosticsContainBlockingIssues, logBootstrapDiagnostics } from './runtime/devtools';
export { buildClickScript, fetchConsoleEvents, fetchSessionSummaries, formatSessionHeadline, resolvePromptOption, resolveSessionIdFromHint, } from './runtime/session';
//# sourceMappingURL=index.d.ts.map