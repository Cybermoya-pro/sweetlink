import { sweetLinkEnv as sharedSweetLinkEnv } from '@sweetistics/sweetlink-shared/env';
export const sweetLinkEnv = sharedSweetLinkEnv;
export const sweetLinkDebug = sweetLinkEnv.debug;
export const sweetLinkCliTestMode = sweetLinkEnv.cliTestMode;
export function readCliEnv() {
    return {
        caPath: sharedSweetLinkEnv.cliCaPath,
        caRoot: sharedSweetLinkEnv.cliCaRoot,
        chromePath: sharedSweetLinkEnv.cliChromePath,
        devtoolsUrl: sharedSweetLinkEnv.cliDevtoolsUrl,
        chromeProfilePath: sharedSweetLinkEnv.cliChromeProfilePath,
        cookieDebug: sharedSweetLinkEnv.cliCookieDebug,
    };
}
export const cliEnv = readCliEnv();
//# sourceMappingURL=env.js.map