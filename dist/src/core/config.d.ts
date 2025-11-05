import type { Command } from 'commander';
import type { CliConfig } from '../types';
export interface RootProgramOptions {
    readonly appUrl: string;
    readonly daemonUrl: string;
    readonly adminKey: string | null;
}
/** Reads the root program options, falling back to defaults when values are missing. */
export declare const readRootProgramOptions: (command: Command) => RootProgramOptions;
/** Extracts SweetLink CLI configuration (app/daemon URLs and admin key). */
export declare function resolveConfig(command: Command): CliConfig;
//# sourceMappingURL=config.d.ts.map