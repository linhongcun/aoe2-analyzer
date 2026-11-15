import arabia from '../../data/game/ladder-arabia-p185872.json';
import team from '../../data/game/ladder-4v4-rm-e1200-1400-90d.json';
import beginner from '../../data/game/ladder-beginner.json';
import type { BeginnerNotes, LadderSnapshot } from '../domain/ladder';

export const ARABIA_SNAPSHOT = arabia as LadderSnapshot;
export const TEAM_SNAPSHOT = team as LadderSnapshot;
export const BEGINNER_NOTES = beginner as BeginnerNotes;
