export interface CliConfig {
  readonly appBaseUrl: string;
  readonly daemonBaseUrl: string;
  readonly adminApiKey: string | null;
  readonly oauthScriptPath: string | null;
}

export type CachedCliTokenSource = 'secret' | 'api';
