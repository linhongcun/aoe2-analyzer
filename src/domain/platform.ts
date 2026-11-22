/** 客户端平台判断与快捷键提示（纯函数，SSR / 非浏览器默认回退为非 Apple）。 */
interface PlatformInfo {
  userAgentDataPlatform?: string;
  platform?: string;
  userAgent?: string;
}

type NavigatorWithUAData = Navigator & {
  userAgentData?: { platform?: string };
};

function readBrowserPlatform(): PlatformInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};
  const nav = navigator as NavigatorWithUAData;
  return {
    userAgentDataPlatform: nav.userAgentData?.platform,
    platform: nav.platform,
    userAgent: nav.userAgent,
  };
}

export function isApplePlatform(env: PlatformInfo = readBrowserPlatform()): boolean {
  const uaDataPlatform = env.userAgentDataPlatform?.trim();
  if (uaDataPlatform) return /^(mac|ios|iphone|ipad|ipod)/i.test(uaDataPlatform);
  const platform = env.platform?.trim();
  if (platform) return /(mac|iphone|ipad|ipod)/i.test(platform);
  const userAgent = env.userAgent?.trim();
  if (userAgent) return /(macintosh|mac os x|iphone|ipad|ipod)/i.test(userAgent);
  return false;
}

export function searchShortcutLabel(env?: PlatformInfo): '⌘ K' | 'Ctrl K' {
  return isApplePlatform(env) ? '⌘ K' : 'Ctrl K';
}
