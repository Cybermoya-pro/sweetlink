import type { CliConfig } from '../types';
import { type SweetLinkBootstrapDiagnostics } from './devtools';
import type { SweetLinkConsoleDump } from './session';
export declare const SMOKE_ROUTE_PRESETS: {
    readonly main: readonly ["timeline/home", "insights", "search", "", "pulse"];
    readonly settings: readonly ["settings/account", "settings/activity", "settings/billing", "settings/notifications", "settings/social", "settings/sync", "settings/import", "settings/extension", "settings/beta"];
    readonly 'billing-only': readonly ["settings/billing"];
    readonly 'pulse-only': readonly ["pulse"];
};
export declare const DEFAULT_SMOKE_ROUTES: ("" | "search" | "timeline/home" | "insights" | "pulse" | "settings/account" | "settings/activity" | "settings/billing" | "settings/notifications" | "settings/social" | "settings/sync" | "settings/import" | "settings/extension" | "settings/beta")[];
export declare const deriveSmokeRoutes: (raw: string | undefined, defaults: readonly string[]) => string[];
export declare const buildSmokeRouteUrl: (base: URL, route: string) => URL;
export declare const navigateSweetLinkSession: (params: {
    sessionId: string;
    targetUrl: URL;
    config: CliConfig;
}) => Promise<void>;
export declare const triggerSweetLinkCliAuto: (devtoolsUrl: string, candidateUrl: string) => Promise<void>;
export declare const ensureSweetLinkSessionConnected: (params: {
    config: CliConfig;
    token: string;
    sessionId: string;
    devtoolsUrl: string;
    currentUrl: string;
    timeoutMs?: number;
    onSessionIdChanged?: (nextSessionId: string) => void;
    candidateUrls?: string[];
}) => Promise<boolean>;
export declare const waitForSmokeRouteReady: (params: {
    devtoolsUrl: string;
    targetUrl: URL;
    timeoutMs: number;
}) => Promise<SweetLinkBootstrapDiagnostics | null>;
export declare function computeSmokeRouteSignature(routes: readonly string[]): string;
export declare function loadSmokeProgressIndex(baseOrigin: string, routes: readonly string[]): Promise<number | null>;
export declare function saveSmokeProgressIndex(baseOrigin: string, routes: readonly string[], nextIndex: number): Promise<void>;
export declare function clearSmokeProgress(baseOrigin: string, routes: readonly string[]): Promise<void>;
export declare const consoleEventIndicatesAuthIssue: (event: SweetLinkConsoleDump) => boolean;
export declare const consoleEventIndicatesRuntimeError: (event: SweetLinkConsoleDump) => boolean;
export declare const formatConsoleEventSummary: (event: SweetLinkConsoleDump) => string;
//# sourceMappingURL=smoke.d.ts.map