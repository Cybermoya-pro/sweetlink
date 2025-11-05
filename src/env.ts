import type { SweetLinkSharedEnv } from '@sweetistics/sweetlink-shared/env';
import { sweetLinkEnv as sharedSweetLinkEnv } from '@sweetistics/sweetlink-shared/env';

export const sweetLinkEnv: SweetLinkSharedEnv = sharedSweetLinkEnv;
export const sweetLinkDebug = sweetLinkEnv.debug;
export const sweetLinkCliTestMode = sweetLinkEnv.cliTestMode;

export interface SweetLinkCliEnv {
  readonly caPath: string | null;
  readonly caRoot: string;
  readonly chromePath: string | null;
  readonly devtoolsUrl: string | null;
  readonly chromeProfilePath: string | null;
  readonly cookieDebug: boolean;
}

export function readCliEnv(): SweetLinkCliEnv {
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
