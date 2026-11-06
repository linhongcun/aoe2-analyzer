import { Link } from 'react-router-dom';

/** 与一局入门「人口与房屋」互链。字符串须与 gameGuide/housing.ts 的同名常量一致。 */
export const HOUSING_GUIDE_HREF = '/game-guide#housing';
export const POP_ANCHOR = 'pop';

export function HousingGuideLink() {
  return (
    <p className="community-tool-row">
      <Link className="community-tool-entry" to={HOUSING_GUIDE_HREF} data-testid="building-housing-link">
        人口与房屋一览
      </Link>
    </p>
  );
}
