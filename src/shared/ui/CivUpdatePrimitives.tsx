export function UpdateText({ children }: { children: string }) {
  return children
    .split(
      /([+-]?\d+(?:\.\d+)?(?:\/[+-]?\d+(?:\.\d+)?)*(?:%|％)?(?:\s*(?:游戏秒|生命值|食物|木材|黄金|木头|石头|分钟|秒|格|HP|肉|金|木|石|个|支|名|点|级|座))?)/gu,
    )
    .map((part, index) =>
      index % 2 ? (
        <span className="num nw" key={index}>
          {part}
        </span>
      ) : (
        part
      ),
    );
}

export function CivUpdatesLoading({ error, retry }: { error: boolean; retry: () => void }) {
  return (
    <div className="civ-update-state" data-testid="civ-updates-loading">
      {error ? (
        <>
          <p role="alert">文明更新历史读取失败，请检查连接后重试。</p>
          <button type="button" onClick={retry}>
            重试文明历史
          </button>
        </>
      ) : (
        <p role="status">正在读取文明更新历史，请稍候。</p>
      )}
    </div>
  );
}

export function SourceTime({ value, missing = '未知' }: { value: string | null; missing?: string }) {
  return value ? (
    <time className="num nw" dateTime={value}>
      {value}
    </time>
  ) : (
    <>{missing}</>
  );
}
