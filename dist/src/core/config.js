import { sweetLinkEnv } from '../env';
import { readCommandOptions } from './env';
const normalizeUrlOption = (value, fallback) => {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }
    return fallback;
};
const normalizeAdminKey = (value) => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    return null;
};
/** Reads the root program options, falling back to defaults when values are missing. */
export const readRootProgramOptions = (command) => {
    const rawOptions = readCommandOptions(command);
    return {
        appUrl: normalizeUrlOption(rawOptions.appUrl, sweetLinkEnv.appUrl),
        daemonUrl: normalizeUrlOption(rawOptions.daemonUrl, sweetLinkEnv.daemonUrl),
        adminKey: normalizeAdminKey(rawOptions.adminKey),
    };
};
/** Extracts SweetLink CLI configuration (app/daemon URLs and admin key). */
export function resolveConfig(command) {
    const parent = command.parent ?? command;
    const options = readRootProgramOptions(parent);
    return {
        adminApiKey: options.adminKey,
        appBaseUrl: options.appUrl,
        daemonBaseUrl: options.daemonUrl,
    };
}
//# sourceMappingURL=config.js.map