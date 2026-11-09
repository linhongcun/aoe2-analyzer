import { describe, expect, it } from 'vitest';
import { DAT, type DatFile } from '../../src/domain/datEffects';
import { MARKET_DATA } from '../../src/domain/market';
import { marketFeeFacts, type MarketEco } from '../../src/domain/marketFeeFacts';
import { ECO } from '../../src/data/eco';

describe('市场费率交叉一致性（issue 834）', () => {
  it('market.json 与 effects/eco 推导的 30/15/5 一致', () => {
    const facts = marketFeeFacts();
    expect(facts.baselineExported).toBe(false);
    expect(MARKET_DATA.baseFee).toBe(facts.tradeDefault?.value);
    expect(MARKET_DATA.guilds.fee).toBe(facts.guilds?.value);
    expect(MARKET_DATA.civFees.Saracens?.fee).toBe(facts.saracens?.value);
  });

  it('facts 确实从 effects/eco 取数，而不是复用 market.json', () => {
    const fakeDat = structuredClone(DAT) as DatFile;
    const fakeEco = structuredClone(ECO) as MarketEco;
    const tech = Object.values(fakeDat.techs).find((candidate) => candidate.id === 15);
    const effect = tech?.eco?.find((candidate) => candidate.res === 78 && candidate.op === 'set');
    const ecoEffect = fakeEco.ecoTechs?.['15']?.effects;
    const ecoRow = Array.isArray(ecoEffect) ? ecoEffect.find((candidate) => candidate?.res === 78 && candidate?.op === 'set') : undefined;
    expect(effect).toBeDefined();
    expect(ecoRow).toBeDefined();
    if (!effect || !ecoRow) return;
    effect.v = 0.2;
    ecoRow.v = 0.2;

    const facts = marketFeeFacts(fakeDat, fakeEco);
    expect(facts.guilds?.value).toBe(0.2);
    expect(MARKET_DATA.guilds.fee).toBe(0.15);
  });
});
