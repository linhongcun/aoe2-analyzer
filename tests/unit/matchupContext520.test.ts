import { createElement as h, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Matchup from '../../src/features/matchup/components/Matchup';
import Duel from '../../src/features/duel/components/Duel';
import { BuildContext } from '../../src/features/builds/BuildContext';

vi.mock('../../src/features/matchup/useMatchupData', () => ({ useMatchupData: () => ({ data: null, error: false }) }));
vi.mock('../../src/data/hooks', () => ({ useCore: () => null, useTrees: () => null }));

let view: ReactTestRenderer;
let navigate: NavigateFunction;
let currentSearch = '';
function Probe() {
  const nav = useNavigate();
  const { search } = useLocation();
  useEffect(() => {
    navigate = nav;
    currentSearch = search;
  }, [nav, search]);
  return null;
}
async function mount(component: ReturnType<typeof h>, entry: string) {
  await act(async () => {
    view = create(h(MemoryRouter, { initialEntries: [entry], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe), component));
  });
}
const context = () => view.root.findByProps({ 'aria-label': '对阵相关入口' });
const links = () =>
  context()
    .findAllByType('a')
    .map((a) => a.props.href as string);
const query = (path: string) => new URL(path, 'https://example.test').searchParams;
afterEach(() => act(() => view?.unmount()));

it('#520 query wins over sticky, picker writes both keys and a bare return remembers the shared pair', async () => {
  await mount(h(Matchup), '/matchup?me=Mongols&opp=Chinese&rush=scouts');
  expect(view.root.findByProps({ id: 'ma', 'data-value': 'Mongols' }).type).toBe('button');
  expect(view.root.findByProps({ id: 'me', 'data-value': 'Chinese' }).type).toBe('button');
  const source = '/matchup?me=Mongols&opp=Chinese&rush=scouts';
  expect(links()).toEqual([
    '/builds?civ=Mongols&from=matchup&opp=Chinese&ctxReturn=' + encodeURIComponent(source),
    '/builds?civ=Chinese&from=matchup&me=Mongols&ctxReturn=' + encodeURIComponent(source),
    '/civ/Mongols',
    '/civ/Chinese',
  ]);
  const opponentBuild = query(links()[1]!);
  expect(Object.fromEntries(opponentBuild)).toEqual({ civ: 'Chinese', from: 'matchup', me: 'Mongols', ctxReturn: source });
  expect(Object.fromEntries(query(opponentBuild.get('ctxReturn')!))).toEqual({ me: 'Mongols', opp: 'Chinese', rush: 'scouts' });
  // CivPicker 的 onChange 是真实页面写 URL 的入口。
  const picker = view.root.findAll((node) => typeof node.type === 'function' && node.props.id === 'ma')[0]!;
  await act(async () => picker.props.onChange('Franks'));
  expect(new URLSearchParams(currentSearch).get('me')).toBe('Franks');
  expect(new URLSearchParams(currentSearch).get('opp')).toBe('Chinese');
  expect(new URLSearchParams(currentSearch).get('rush')).toBe('scouts');
  await act(async () => navigate('/matchup'));
  expect(view.root.findByProps({ id: 'ma', 'data-value': 'Franks' }).type).toBe('button');
  await act(async () => navigate('/matchup?me=unknown&opp=Japanese'));
  expect(view.root.findByProps({ id: 'ma', 'data-value': 'Franks' }).type).toBe('button');
  expect(view.root.findAllByType('p').some((p) => p.children.includes('链接中的文明无效，已用上次选择'))).toBe(true);
});

it('#520 duel keeps a bare return after automatic repair of a bad pack, then responds to new valid packs', async () => {
  await mount(h(Duel), '/duel?a=bad.Mongols.2..&b=74.Chinese.2..');
  expect(currentSearch).toContain('a=569.Franks'); // 既有 PK 自动修复仍工作。
  const repairedSource = '/duel?a=569.Franks.4.f.&b=74.Chinese.2..&m=1';
  expect(links()).toEqual(['/matchup', '/civ/Chinese', '/builds?civ=Chinese&from=duel&ctxReturn=' + encodeURIComponent(repairedSource)]);
  const repairedBuild = query(links()[2]!);
  expect(Object.fromEntries(repairedBuild)).toEqual({ civ: 'Chinese', from: 'duel', ctxReturn: repairedSource });
  expect(Object.fromEntries(query(repairedBuild.get('ctxReturn')!))).toEqual({ a: '569.Franks.4.f.', b: '74.Chinese.2..', m: '1' });
  await act(async () => navigate('/duel?a=4.Mongols.2..&b=74.Chinese.2..'));
  const validSource = '/duel?a=4.Mongols.2..&b=74.Chinese.2..&m=1';
  expect(links()).toEqual([
    '/matchup?me=Mongols&opp=Chinese',
    '/civ/Mongols',
    '/civ/Chinese',
    '/builds?civ=Mongols&from=duel&me=Mongols&opp=Chinese&ctxReturn=' + encodeURIComponent(validSource),
    '/builds?civ=Chinese&from=duel&me=Mongols&opp=Chinese&ctxReturn=' + encodeURIComponent(validSource),
  ]);
  const validBuild = query(links()[4]!);
  expect(Object.fromEntries(validBuild)).toEqual({ civ: 'Chinese', from: 'duel', me: 'Mongols', opp: 'Chinese', ctxReturn: validSource });
  expect(Object.fromEntries(query(validBuild.get('ctxReturn')!))).toEqual({ a: '4.Mongols.2..', b: '74.Chinese.2..', m: '1' });
  await act(async () => navigate('/duel'));
  expect(links()).toEqual(['/matchup']);
});

it('#520 opponent builds shows the original pair, civ page and full list retaining civ', async () => {
  await mount(h(BuildContext, { params: new URLSearchParams('civ=Chinese&from=matchup&me=Mongols&bo=archers-19') }), '/builds');
  expect(links()).toEqual(['/civ/Chinese', '/matchup?me=Mongols&opp=Chinese', '/builds?civ=Chinese&from=matchup&me=Mongols&opp=Chinese']);
  expect(Object.fromEntries(query(links()[2]!))).toEqual({ civ: 'Chinese', from: 'matchup', me: 'Mongols', opp: 'Chinese' });
});

it('#531 full build list retains the original pair, complete source and simulation inputs while clearing the selected route and progress', async () => {
  const source = '/matchup?me=Mongols&opp=Chinese&rush=scouts';
  const buildSource = '/builds?civ=Chinese&from=matchup&me=Mongols&opp=Chinese&dist=7&house=0&bo=archers-19&step=4&view=practice&ctxStepReset=1';
  const params = new URLSearchParams(buildSource.split('?')[1]!);
  params.set('ctxReturn', source);
  await mount(h(BuildContext, { params }), '/builds?' + params);
  expect(links()).toEqual([
    '/civ/Chinese?ctxReturn=' + encodeURIComponent(buildSource) + '&me=Mongols&opp=Chinese',
    source,
    '/builds?civ=Chinese&from=matchup&me=Mongols&opp=Chinese&dist=7&house=0&ctxReturn=' + encodeURIComponent(source),
  ]);
  const fullList = query(links()[2]!);
  expect(Object.fromEntries(fullList)).toEqual({ civ: 'Chinese', from: 'matchup', me: 'Mongols', opp: 'Chinese', dist: '7', house: '0', ctxReturn: source });
  expect(Object.fromEntries(query(fullList.get('ctxReturn')!))).toEqual({ me: 'Mongols', opp: 'Chinese', rush: 'scouts' });
  expect(Object.fromEntries(query(query(links()[0]!).get('ctxReturn')!))).toEqual({
    civ: 'Chinese',
    from: 'matchup',
    me: 'Mongols',
    opp: 'Chinese',
    dist: '7',
    house: '0',
    bo: 'archers-19',
    step: '4',
    view: 'practice',
    ctxStepReset: '1',
  });
});
