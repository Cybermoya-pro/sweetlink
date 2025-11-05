import { sweetLinkEnv } from '../env';
import { loadSweetLinkFileConfig } from './config-file';
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
    const { config } = loadSweetLinkFileConfig();
    const optionUrl = typeof rawOptions.appUrl === 'string'
        ? rawOptions.appUrl
        : typeof rawOptions.url === 'string'
            ? rawOptions.url
            : undefined;
    const optionPort = normalizePort(rawOptions.port);
    const configPort = typeof config.port === 'number' ? config.port : null;
    const fallbackAppUrl = resolveDefaultAppUrl({
        optionUrl,
        optionPort,
        configAppUrl: config.appUrl,
        configPort,
    });
    const fallbackDaemonUrl = config.daemonUrl ?? sweetLinkEnv.daemonUrl;
    const fallbackAdminKey = rawOptions.adminKey ?? config.adminKey ?? sweetLinkEnv.localAdminApiKey ?? sweetLinkEnv.adminApiKey ?? null;
    return {
        appUrl: normalizeUrlOption(optionUrl, fallbackAppUrl),
        daemonUrl: normalizeUrlOption(rawOptions.daemonUrl, fallbackDaemonUrl),
        adminKey: normalizeAdminKey(fallbackAdminKey),
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
const LOCAL_DEFAULT_URL = 'http://localhost:3000';
function resolveDefaultAppUrl({ optionUrl, optionPort, configAppUrl, configPort }) {
    if (optionUrl && optionUrl.trim().length > 0) {
        return optionUrl;
    }
    if (typeof optionPort === 'number') {
        return applyPortToUrl(configAppUrl ?? sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL, optionPort);
    }
    if (configAppUrl) {
        return configAppUrl;
    }
    if (configPort) {
        return applyPortToUrl(sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL, configPort);
    }
    return sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL;
}
function applyPortToUrl(base, port) {
    try {
        const url = new URL(base);
        url.port = String(port);
        return url.toString();
    }
    catch {
        return `http://localhost:${port}`;
    }
}
function normalizePort(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
}
//# sourceMappingURL=config.js.map