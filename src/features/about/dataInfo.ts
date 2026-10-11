/** 数据版本信息（scripts/data_sources.json 在构建时注入） */
export interface SourcePin {
  repo: string;
  commit: string;
  path: string;
  date: string;
  use: string;
  sha256?: string;
  markers?: Record<string, unknown>;
}
export interface DataSources {
  patch: { build: number; date: string; name: string; detectedFrom: string };
  updated: string;
  sources: Record<string, SourcePin>;
}

export const REPO = 'https://github.com/linhongcun/aoe2-analyzer';
export const versionLabel = (p: DataSources) => `DE ${p.patch.build}（${p.patch.date}）`;
export const commitUrl = (s: SourcePin) => `https://github.com/${s.repo}/tree/${s.commit}/${s.path}`;
export const patchNoteUrl = (build: string) => `${REPO}/blob/main/docs/PATCH-NOTES/${build}.md`;
export const DATA_SOURCES: DataSources = typeof __DATA_SOURCES__ === 'undefined' ? ({} as DataSources) : __DATA_SOURCES__;
export const PATCH_NOTES: string[] = typeof __PATCH_NOTES__ === 'undefined' ? [] : __PATCH_NOTES__;
