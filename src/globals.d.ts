/** 构建时注入（vite.config.ts define） */
declare const __BUILD__: string;
declare const __DATA_VERSION__: string;
declare const __DATA_SOURCES__: import('./features/about/dataInfo').DataSources;
declare const __PATCH_NOTES__: string[];
declare const __UNIT_COUNT__: number;
declare const __CATALOG_COUNTS__: Record<'units' | 'techs' | 'buildings' | 'builds' | 'patches', number>;
declare const __APP_VERSION__: string;
