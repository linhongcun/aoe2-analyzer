/** 扳指局部数字片段：整段说明可换行，倍率与原始系数不可拆开。 */
export function ThumbRingEffectText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(×\d+(?:\.\d+)?|v:\d+(?:\.\d+)?)/g).map((part, index) =>
        /^(?:×|v:)\d/.test(part) ? (
          <span className="num nw" key={index}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
