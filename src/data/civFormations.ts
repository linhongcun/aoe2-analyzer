import raw from '../../data/content/civ-formations.json';
import type { CivFormationContent } from '../domain/civFormations';

// 由 content-civ-formations schema 校验随构建提交的内容。
export const civFormationContent = raw as CivFormationContent[];
