"""188329 的三组已核对平衡改动：官方旧值 + 当前固定 DAT 新值。"""
import json
from datetime import datetime, timezone, timedelta

SOURCE = 'https://www.ageofempires.com/news/age-of-empires-ii-definitive-edition-update-188329/'
PUBLISHED = '2026-10-27T10:04:41-07:00'
FIXED_COMMITS = {
    'dat': 'e293dc106b0f3b0ceac2db98409fbcc5c921190b',
    'aoe2techtree': 'e56728e76b7d08301fba7b18d5f16bc8554c109a',
    'halfon': '7f96c37fc5f63c7141ec7d88e91c627beb375b28',
}
DAT_SHA256 = 'd0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f'


def generate(root):
    from dat_source import DAT, load
    pins = json.loads((root / 'scripts/data_sources.json').read_text())
    assert pins['patch']['build'] == 188329, '188329 档案必须使用本补丁的固定来源'
    assert {key: value['commit'] for key, value in pins['sources'].items()} == FIXED_COMMITS, '188329 固定来源身份变化'
    assert pins['sources']['dat']['sha256'] == DAT['sha256'] == DAT_SHA256, '188329 DAT 来源身份变化'
    units = {row['id']: row for row in json.loads((root / 'src/data/units.json').read_text())}
    dat = load()
    raw = dat['Civs'][0]['Units']
    entries = []

    def add(uid, kind, summary, before, after, civs=None):
        entries.append(dict(
            id=f'188329-{len(entries) + 1}', kind=kind, targetType='unit', targetId=uid,
            targetNameZh=units[uid]['zh'], civIds=civs or [], summaryZh=summary,
            before=str(before), after=str(after), source=SOURCE,
            provenance='dat', changeType='stats', verification='official',
        ))

    for uid, hp in [(873, 220), (875, 270)]:
        cost = {resource: amount for resource, amount, *_ in raw[uid]['Cost']}
        assert cost[0] == 70 and cost[3] == 80, (uid, cost)
        assert raw[uid]['HP'] == hp, (uid, raw[uid]['HP'])
        assert units[uid]['cost'] == {'Food': cost[0], 'Gold': cost[3]}, uid
        assert units[uid]['hp'] == hp, uid
        add(uid, 'nerf', '基础食物费用增加，黄金费用不变。',
            '60 食物、80 黄金', f'{cost[0]} 食物、{cost[3]} 黄金')
        add(uid, 'nerf', '基础生命降低（未计文明与科技加成）。', hp + 10, raw[uid]['HP'])

    # DAT 的单精度速度按公开显示精度比较，JSON 与 DAT 必须一致。
    speed = round(raw[2569]['Speed'], 2)
    assert speed == 1.45 and units[2569]['spd'] == speed
    assert raw[2571]['Speed'] == units[2571]['spd'] == 1.5, '精锐掷石绳骑兵不变'
    add(2569, 'nerf', '基础移速降低；精锐移速仍为 1.5。', 1.5, speed, ['Mapuche'])

    # 官方所述两组目标由 DAT 的攻击类别 8 / 30 表示；不要误改 Runner。
    attacks = dict(raw[2550]['Attacks'])
    runner = next(unit for unit in units.values() if unit['en'] == 'Champi Runner')
    runner_attacks = dict(raw[runner['id']]['Attacks'])
    for attack_class, label in [(8, '骑兵'), (30, '骆驼')]:
        assert attacks[attack_class] == 2
        assert dict(units[2550]['atks'])[label] == attacks[attack_class]
        assert runner_attacks.get(attack_class, 0) == 0
        assert dict(runner['atks']).get(label, 0) == 0
        add(2550, 'buff', f'对{label}类别的额外伤害增加（DAT 类别 {attack_class}）；蔷琵步兵不变。',
            1, attacks[attack_class])
        entries[-1]['originalText'] = 'Scout Cavalry-line and Camel Scout'
        entries[-1]['scopeNote'] = (
            '官方说明列出的目标是斥候骑兵线与骆驼斥候；此处展示固定 DAT 的骑兵／骆驼攻击类别。'
            '对具体单位的净额外伤害还取决于该单位对应类别的护甲，不能仅凭类别名推断。'
        )

    published = datetime.fromisoformat(PUBLISHED).astimezone(timezone(timedelta(hours=8))).date().isoformat()
    return dict(
        id='188329', title='DE Update 188329', branch='DE', releaseType='release',
        releaseDate='2026-10-27', announcedAt='2026-10-27', publishedAt=published,
        sourcePublishedAt=PUBLISHED, source=SOURCE, verifiedAt='2026-10-29',
        coverage='已核对三组平衡改动：骑象射手、掷石绳骑兵与蔷琵斥候；未收录完整官方修复清单。',
        note='改动前取自官方 188329 平衡说明，改动后由本补丁固定 DAT 与生成数据交叉核对。精锐掷石绳骑兵与蔷琵步兵作为不变对照；不声称模拟本次官方引擎修复。',
        entries=entries,
    )
