/** Registers the mkcert CA with undici so HTTPS requests succeed without NODE_TLS_REJECT_UNAUTHORIZED hacks. */
export declare function maybeInstallMkcertDispatcher(): void;
/** Ensures the local dev server and database are online, attempting to start them via runner when needed. */
export declare function ensureDevStackRunning(targetUrl: URL, options: {
    repoRoot: string;
}): Promise<void>;
/** Performs a lightweight HEAD request to confirm the web app responds. */
export declare function isAppReachable(appBaseUrl: string): Promise<boolean>;
/** Checks common Postgres ports to see if the local database is reachable. */
export declare function isDatabaseReachable(): Promise<boolean>;
//# sourceMappingURL=devstack.d.ts.map