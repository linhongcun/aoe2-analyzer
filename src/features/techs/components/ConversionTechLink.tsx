import { Link } from 'react-router-dom';

/** 虔诚 / 信念页只放短链。正文在僧侣页 `#/unit/125#conversion`。 */
export function ConversionTechLink() {
  return (
    <>
      <p className="note">上方百分比是平均时间的近似说法，不是另一套数值。</p>
      <p>
        <Link className="community-tool-entry" to="/unit/125#conversion">
          查看招降间隔与概率
        </Link>
      </p>
    </>
  );
}
