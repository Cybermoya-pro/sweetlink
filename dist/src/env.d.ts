import type { SweetLinkSharedEnv } from '@sweetistics/sweetlink-shared/env';
export declare const sweetLinkEnv: SweetLinkSharedEnv;
export declare const sweetLinkDebug: boolean;
export declare const sweetLinkCliTestMode: boolean;
export interface SweetLinkCliEnv {
    readonly caPath: string | null;
    readonly caRoot: string;
    readonly chromePath: string | null;
    readonly devtoolsUrl: string | null;
    readonly chromeProfilePath: string | null;
    readonly cookieDebug: boolean;
}
export declare function readCliEnv(): SweetLinkCliEnv;
export declare const cliEnv: SweetLinkCliEnv;
//# sourceMappingURL=env.d.ts.map