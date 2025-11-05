import type { Browser, Page } from 'playwright-core';
export interface SweetLinkBootstrapDiagnostics {
    readyState?: string;
    autoFlag?: boolean;
    bootstrapEmits?: number;
    sessionStorageAuto?: string | null;
    locationHref?: string | null;
    locationPathname?: string | null;
    errors?: Array<{
        type?: string;
        message?: string;
        source?: string | null;
        stack?: string | null;
        status?: number | null;
        timestamp?: number | null;
    }>;
    overlayText?: string | null;
    nextRouteError?: {
        message?: string | null;
        digest?: string | null;
    } | null;
}
export type BootstrapDiagnosticError = NonNullable<SweetLinkBootstrapDiagnostics['errors']>[number];
export interface DevToolsConfig {
    readonly devtoolsUrl: string;
    readonly port: number;
    readonly userDataDir: string;
    readonly updatedAt: number;
    readonly targetUrl?: string;
    readonly sessionId?: string;
    readonly viewport?: {
        readonly width: number;
        readonly height: number;
        readonly deviceScaleFactor?: number;
    };
}
export interface DevToolsState {
    endpoint: string;
    sessionId?: string;
    viewport?: {
        readonly width: number;
        readonly height: number;
        readonly deviceScaleFactor?: number;
    };
    console: DevToolsConsoleEntry[];
    network: DevToolsNetworkEntry[];
    updatedAt: number;
}
export interface DevToolsConsoleEntry {
    readonly ts: number;
    readonly type: string;
    readonly text: string;
    readonly args: unknown[];
    readonly location?: {
        readonly url?: string;
        readonly lineNumber?: number;
        readonly columnNumber?: number;
    };
}
export interface DevToolsNetworkEntry {
    readonly ts: number;
    readonly method: string;
    readonly url: string;
    readonly status?: number;
    readonly resourceType?: string;
    readonly failureText?: string;
}
export interface DevToolsTabEntry {
    id: string;
    title: string;
    url: string;
    type?: string;
    webSocketDebuggerUrl?: string;
}
export type ResolvedDevToolsConnection = {
    browser: Browser;
    page: Page;
};
export type TwitterOauthAutoAcceptResult = {
    handled: boolean;
    action?: string;
    reason?: string;
    clickedText?: string | null;
    hasUsernameInput?: boolean;
    hasPasswordInput?: boolean;
};
//# sourceMappingURL=types.d.ts.map