export interface SweetLinkFileConfig {
    appUrl?: string;
    prodUrl?: string;
    daemonUrl?: string;
    adminKey?: string;
    port?: number;
}
interface LoadedConfig {
    readonly path: string | null;
    readonly config: SweetLinkFileConfig;
}
export declare function resetSweetLinkFileConfigCache(): void;
export declare function loadSweetLinkFileConfig(): LoadedConfig;
export {};
//# sourceMappingURL=config-file.d.ts.map