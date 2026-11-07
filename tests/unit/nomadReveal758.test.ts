import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { civByEn } from '../../src/data';
import { arenaCastleGold } from '../../src/features/civs/arenaCastleGold';
import { NomadReveal, NomadRevealView } from '../../src/features/civs/components/NomadReveal';
import {
  NOMAD_REVEAL_CHECKED,
  NOMAD_REVEAL_EN,
  NOMAD_REVEAL_FORBIDDEN,
  NOMAD_REVEAL_HREFS,
  NOMAD_REVEAL_UPDATE,
  nomadReveal,
  nomadRevealFor,
  nomadRevealLineText,
  nomadRevealText,
  type NomadReveal as NomadRevealCard,
  type NomadRevealCiv,
} from '../../src/features/civs/nomadReveal';

const markup = (card: NomadRevealCard) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: '/civ/Vietnamese' }, createElement(NomadRevealView, { card })));
const page = (en: string) => renderToStaticMarkup(createElement(StaticRouter, { location: `/civ/${en}` }, createElement(NomadReveal, { en })));
const visible = (html: string) => html.replace(/<[^>]*>/g, '');
const line = (card: NomadRevealCard, id: string) => {
  const found = card.lines.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return nomadRevealLineText(found);
};

describe('#758 越南游牧定位与揭示边界', () => {
  it('只挂越南文明详情，不挂到其他文明或 #757 的三张黄金卡', () => {
    expect(nomadReveal('Vietnamese')?.civ).toBe('Vietnamese');
    for (const civ of ['Muisca', 'Ethiopians', 'Varangians', 'Britons', 'Franks', 'Generic']) expect(nomadReveal(civ)).toBeNull();
    expect(page('Vietnamese')).toContain('data-testid="nomad-reveal"');
    expect(page('Franks')).toBe('');
    expect(page('Muisca')).toBe('');
    expect(arenaCastleGold('Vietnamese')).toBeNull();
    expect(arenaCastleGold('Muisca')?.title).toBe('竞技场黄金收支');
    expect(arenaCastleGold('Ethiopians')?.civ).toBe('Ethiopians');
    expect(arenaCastleGold('Varangians')?.civ).toBe('Varangians');
  });

  it('用本站原文区分文明加成和帝王掷矛手团队加成', () => {
    const civ = civByEn('Vietnamese');
    expect(civ?.bonEn).toContain(NOMAD_REVEAL_EN);
    expect(civ?.bon[0]).toBe('游戏开始时就能显示敌方城镇中心位置');
    expect(civ?.tb).toBe('在帝王时代可升级为帝王掷矛手');
    expect(civ?.tbEn).toBe('Imperial Skirmisher upgrade available in Imperial Age');
    const card = nomadReveal('Vietnamese')!;
    expect(card.bonusIndex).toBe(0);
    expect(line(card, 'site')).toBe('游戏开始时就能显示敌方城镇中心位置');
    expect(line(card, 'site-en')).toBe(NOMAD_REVEAL_EN);
    expect(line(card, 'kind')).toBe('文明加成');
    expect(line(card, 'team')).toBe('在帝王时代可升级为帝王掷矛手');
    expect(line(card, 'team-en')).toBe('Imperial Skirmisher upgrade available in Imperial Age');
    expect(line(card, 'target')).toBe('敌方初始城镇中心位置');
    expect(line(card, 'share')).toBe('须开启共享探索或共享视野');
    expect(line(card, 'patch')).toBe(`Update ${NOMAD_REVEAL_UPDATE}`);
    expect(line(card, 'checked')).toBe(NOMAD_REVEAL_CHECKED);
    const text = nomadRevealText(card);
    expect(text).toContain('定位对手');
    expect(text).toContain('规划进攻');
    expect(text).toContain('团队协同');
    expect(text).toContain('属于文明加成，不是团队加成');
    expect(text).toContain('并非揭示敌方初始单位');
    expect(text).toContain('也不代表获得敌军持续视野');
  });

  it('游牧完工时点只作为社区依据，并保持待确认和未实测', () => {
    const card = nomadReveal('Vietnamese')!;
    expect(line(card, 'nomad')).toBe('社区依据，当前版本待确认');
    expect(card.lines.find((item) => item.id === 'nomad')?.pending).toBe(true);
    const text = nomadRevealText(card);
    expect(text).toContain('社区资料把游牧写成开局没有城镇中心');
    expect(text).toContain('敌方首座城镇中心完工后才显示位置');
    expect(text).toContain('不是同一句已验证结论');
    expect(text).toContain('当前版本待确认，本站未实测');
    expect(text).toContain('另有社区说法写成每座敌方城镇中心');
    expect(text).toContain('本说明只采用初始位置，更宽范围待确认');
    expect(text).not.toContain('实测通过');
  });

  it('共享视野写成开启前提，并引用通用的 Update 73855', () => {
    const text = nomadRevealText(nomadReveal('Vietnamese')!);
    expect(text).toContain('以开启共享探索或共享视野为前提');
    expect(text).toContain('共享视野在匹配模式和大厅对局里默认开启');
    expect(text).toContain('这是通用设置，不是越南专属细则');
    expect(text).toContain('自定义设置仍可能不同');
    expect(text).not.toContain('先造市场');
    expect(text).not.toContain('市场');
  });

  it('不写村民、侦察兵、全体敌军、持续全图或后续触发', () => {
    const text = nomadRevealText(nomadReveal('Vietnamese')!);
    for (const word of NOMAD_REVEAL_FORBIDDEN) expect(text).not.toContain(word);
    expect(text).not.toContain('持续全图');
    expect(text).not.toContain('持续侦察');
  });

  it('原文或团队加成对不上时不显示，注入越界词也不显示', () => {
    const civ = civByEn('Vietnamese') as NomadRevealCiv;
    expect(nomadRevealFor({ ...civ, en: 'Britons' })).toBeNull();
    expect(nomadRevealFor({ ...civ, bonEn: civ.bonEn.map((item) => item.replace('Town Centers', 'Villagers')) })).toBeNull();
    expect(nomadRevealFor({ ...civ, bon: civ.bon.slice(1), bonEn: civ.bonEn.slice(1) })).toBeNull();
    expect(nomadRevealFor({ ...civ, tb: '' })).toBeNull();
    expect(nomadRevealFor({ ...civ, tb: '村民也能看见' })).toBeNull();
    const moved = nomadRevealFor({ ...civ, bon: [...civ.bon.slice(1), civ.bon[0]!], bonEn: [...civ.bonEn.slice(1), civ.bonEn[0]!] });
    expect(moved?.bonusIndex).toBe(civ.bon.length - 1);
    expect(nomadRevealLineText(moved!.lines.find((item) => item.id === 'team')!)).toBe(civ.tb);
  });

  it('说明渲染在越南页的同一张卡上，并链到加成与来源', () => {
    const card = nomadReveal('Vietnamese')!;
    const html = markup(card);
    expect(html).toContain('data-civ="Vietnamese"');
    expect(html).toContain('data-bonus-index="0"');
    expect(html).toContain('data-pending="true"');
    expect(html).toContain('href="/civ/Vietnamese/bonus/0"');
    expect(html).toContain('href="/civ/Vietnamese/bonus/team"');
    expect(html).toContain(`href="${NOMAD_REVEAL_HREFS.fextralife}"`);
    expect(html).toContain(`href="${NOMAD_REVEAL_HREFS.fandom}"`);
    expect(html).toContain(`href="${NOMAD_REVEAL_HREFS.strategy}"`);
    expect(html).toContain(`href="${NOMAD_REVEAL_HREFS.liquipedia}"`);
    expect(html).toContain(`href="${NOMAD_REVEAL_HREFS.update}"`);
    expect(visible(html)).toContain('游牧定位与揭示边界');
    expect(visible(html)).toContain('73855');
    expect(visible(html)).toContain(NOMAD_REVEAL_CHECKED);
  });
});
