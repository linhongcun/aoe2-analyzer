# 固定 DE188329 教学兼容性核对（#486）

Reviewed 2026-10-29. Scope: preserve the exact historical `game-guide.json` and `team-plan.json`, and qualify only their existing business content for fixed DE188329. This audit is source/data comparison, not a game-client playtest, new teaching advice, or a future-version approval.

## Inputs and identity

Baseline repository commit `7f3521c2`; baseline DAT `SiegeEngineers/auto-mods@0c38027504532826c9922e4db77e2c1d33554291`, `dat/empires2_x2_p1.dat`, SHA256 `4aa2f0a719e88e5f1502517eddb27c669aeb40c2fe9d8c4f3eec7751c01e7baa`; baseline tech tree `SiegeEngineers/aoe2techtree@3bb43b1439eef88dfe7fe892d7f7dc41ac9dd76f`; baseline halfon `SiegeEngineers/halfon@abb48fdbedba57d5afe2b7941d6ae85cf6e0e803`.

Approved target source pins: DAT `SiegeEngineers/auto-mods@e293dc106b0f3b0ceac2db98409fbcc5c921190b`, path above, SHA256 `d0aefd92428e2215d6f4d9b1d544901e6f171e19183f9e0b88218de5153a337f`; tech tree `SiegeEngineers/aoe2techtree@e56728e76b7d08301fba7b18d5f16bc8554c109a`; halfon `SiegeEngineers/halfon@7f96c37fc5f63c7141ec7d88e91c627beb375b28`.

Historical content bytes match baseline exactly: game-guide SHA256 `0fb5169eb64fcbf3ebd45a589936509892fca343426180d36f090fa7d94d6335`; team-plan SHA256 `21f4384b9c5bca40fcb0892d26b418557eb6798ed5b249f5d3ba8c6a3e4cdec7`. The source checked dates and publication dates are historical evidence and receive no change. Original source-reading audit `docs/design/v0.26.0-audit256.md` and `docs/design/v0.25.0-audit243.md` was inspected; original public-date correction evidence in #335 was inspected. No fresh external-source reading is claimed by this review.

## Complete reference and field coverage

All 39 `team-plan.unitIds`, in their exact content order, plus guide villager83 were compared as complete generated unit objects, including names, descriptions, ages, primary building, predecessor, upgrade cost/time, all resource costs and training times, HP/attacks/armour/classes/range/speed and all civ membership lists. Every property is identical before/after. Fields were `id,en,zh,type,age,b,pic,from_,cost,hp,atk,ma,pa,rng,minr,spd,los,rof,tt,acc,blast,atks,arms,armc,desc,civs,cls,up,bz,ben,py,pyi` (actual object property sets differ by unit).

Entire generated `buildings.json` is identical; this covers all eight directly relevant buildings12/49/82/87/101/104/109/1665 and all alternative/alias/predecessor records. Entire generated `trees.json` is identical, covering all building rows, unit/tech cells, status bits, age bands, dependencies and all56 civs. Entire `garrison_general` gameplay payload excluding only source metadata is identical; all156 upgrade-map entries, all building aliases/predecessors, and all upgrade/age prerequisite data are therefore unchanged. Entire `effects.json` excluding only source metadata is identical.

Full generated tech records47/101/102/103 are identical, including English/Chinese names/descriptions, age, building, predecessor, costs, time and civ membership. Guide explicitly references only the three era labels and general unlock meaning; it publishes no age costs, research times or universal civ qualification. The 24 unit-upgrade tech IDs are96,98,100,197,207,209,217,218,222,236,237,239,254,255,257,264,265,320,384,428,429,434,521,1174. Their complete recursive prerequisite closure with chemistry47 and era101/102/103 is78 raw DAT tech records; all compact numeric/mechanical fields are identical. A deeper full-DAT comparison found only unrelated language-name changes on tech1458/1459/1460, so the full records in that closure are unchanged too. Complete 78-ID closure is in the generated audit JSON.

All relevant `eco.units` full rows for39+83, all `ageReq`, all `ecoTechs`, and all `civEco` are identical. This covers production routes, costs/time, chemistry unlock, civ exceptions, production tech effects and building-age prerequisites. All four example civ objects (Britons,Franks,Huns,Ethiopians) are identical. Unit eligibility lists for all39 and the entire56-civ tree are unchanged.

All6552 configurations (56 civs × ages2/3/4 ×39 units) were checked for potential production routes before/after using the actual inputs/conditions of the existing production helper, including Armenian, Cuman, Burgundian, Bohemian earlier ages, chemistry, exact tree status, building civ membership/age, unit civ membership and additional .dat routes. All route lists are identical;2676 configurations have at least one route. Route-table SHA256 over `JSON.stringify([[civ,age,id,routes],...])` is `a5dadef9227a892eeb39148d5df07e3ff108209ce17ef4e7309a8733d3419a71` in the source civ order, ages[2,3,4], content unit order. This independent audit uses the source helper's conditions; application tests should additionally call the real helpers.

## Example: all rows, completions, unlocks and eligibility

All12 player/age rows,13 forces (12main+1secondary),13 completed-building entries,6 completed-form entries and0 completed-unlock entries were explicitly checked. Every selected force has eligible civ and exact tree cell at that age, legal route, completed building, required final form confirmation, and no missing explicit unlock.

- Britons P1 and Ethiopians P4: age2 unit4/building87; age3 unit24/building87, completed form24 (DAT tech100); age4 unit492/building87, completed form492 (DAT tech237; predecessor form24). Exact civ availability and upgrades remain unchanged.
- Franks P2 and Huns P3: age2 unit448/building101; age3 unit38/building101; age4 unit569/building101, completed form569 (DAT tech265; predecessor283/tech209). Exact civ availability and upgrades remain unchanged.
- Franks P2 age4 secondary331/building82: imperial-age base form; completed castle82; no separate unit-shape completion or chemistry unlock. Both source versions permit it.
- The example intentionally confirms final forms only, as implemented by the existing tool. Historical design prose that said arrays also contain earlier forms is not the actual frozen JSON. No adapter should silently add those forms or change business content.
- Chemistry47 is explicitly required for whitelist units5 and36, and remains required. Neither gunpowder unit occurs in the example, hence empty completedUnlockTechIds arrays are valid for all12 rows. No unlock requirement is removed or manufactured.
- `supply` is `unchecked` for every row; prerequisite compatibility does not establish actual supplies, army strength or field readiness. Task owners/intentional gaps, map conditions, role assumptions, retreat/support/rally text remain editorial/user agreements and are copied unchanged.

## Guide: every card and numerical fact

- `goal`: preserves conditional conquest/defeat/surrender explanations and warning that score is not victory; optional wonder/relic mechanisms remain historical official185872 evidence. The new DAT has identical full1500 effects and identical all63 civ resource vectors (including victory-related resource values); this review adds no timer, settings or ranked default claim.
- `roles`: preserves TC training/research/era role (building109, villager83, tech101–103), villagers gathering/building/repairing, scouting and explored-vs-current vision. Villager83 and all referenced units' full DAT records are unchanged; all unit headers and the compact task collection are identical; full effects and civ resources are unchanged. TC109 changes only its garrison artwork pointer, not gameplay properties. The card explicitly omits starting unit kinds/counts and special civ defaults.
- `resources`: preserves Food/Wood/Gold/Stone categories, units/buildings/tech requirements, resource allocation, training/research taking time, and the absence of universal thresholds or worker ratios. Relevant full unit/building/tech costs and times, eco/prerequisite data, full effects and all civ resource vectors are identical.
- `ages`: preserves Dark→Feudal→Castle→Imperial order and names, era investments/choices and civ/config qualification. Exact tech101/102/103 labels/descriptions and prerequisite fields are identical; no costs/times/build-order timing or automatic strength ranking are introduced.
- `counters`: preserves only the conditional spear-line-vs-cavalry role and explicit form/upgrade/count/engagement caveats. Complete spear93/358/359 and cavalry pool raw/generated records, full attacks/armours/classes, upgrades/effects, civ trees and routes are unchanged. It publishes no damage, win-rate, ratio or result guarantee; geometry/micro remain stated model limits.
- `watching`: contains editorial observation questions, distinguishing visible facts from assumptions. It introduces no game number, unit/stat reference, automatic judgement, validated learning benefit or simulation claim. The vision distinction has the same unchanged source mechanics above.

Only catalogue/format counters and example identity numbers appear besides IDs/versions/dates/source lesson locators: exactly6 cards,39 supported unit shapes,4v4 with4 roster entries, phase ages2/3/4. The 2v2 source claim remains a historical conditional community/event observation; no patch-specific optimal composition or new balance advice is claimed. All dates/publication metadata/lesson locators retain their original meaning.

## Actual differences and disposition

Generated game data changes are exactly unit873/875 HP+cost, unit2569 speed, unit2550 attack entries/classes8/30, units2708/2709 class36 removal, tech1491 Chinese wording, and Saxons bonus wording (Chinese-localized food grant on completed mill/lumber/mining camps+35→+50). None belongs to the39-unit whitelist, guide-specific villager83/spear role, four example civs, direct tech references, or78 prerequisite-tech closure. No stated teaching claim depends on any changed value.

Deeper raw source audit checked61 unit/building-alias IDs in all63 civs. Exactly50 civs change referenced buildings12 and109 only at `creatable.garrison_graphic`: old4432/new9597–9608 and old4566/new9585–9596 respectively (the target pointer depends on civilization; British/French use9608/9596). These are artwork pointers, absent from all published numerical/route/prerequisite facts. All referenced gameplay fields remain identical. Full1500 Effects, full unit_headers, and all63 civ resourcevectors are identical. Full raw tech changes are ONLY language_dll_name1458/1459/1460 (-1→10330/10331/10332), outside the closure. Raw tech_tree adds unit UI connection IDs2626/2627/2628, outside the whitelist, and removes a duplicate tech911 research connection (count2→1); all shared ID-record contents and all referenced connection records remain unchanged. Do not claim entire raw tech/tech_tree objects are byte-identical.

No new gameplay fact is required to represent this qualified view. Approval is only target188329 with the exact historical content digests and explicit full source pins above; any other patch/source/content requires another review.

## Runtime and UI acceptance contract

The sidecar `src/data/teachingCompatibility188329.ts` is a manual review record. The runtime adapters recognize only the two reviewed imported catalogues and these exact three source identities, and change only the guide's version view and the example's patch to literal188329. A small FNV-1a fingerprint rejects accidental content drift at runtime; it is not a cryptographic proof. Independently, CI computes SHA256 from the actual original JSON bytes and compares it with the fixed record. CI also locks all generated projections below to the audited baseline. A changed content fingerprint or source identity disables qualification, retaining historical185872 so the existing current-version guard rejects the catalogue/example. No user-owned link goes through the adapter.

A future `DATA_PATCH_BUILD=188330` leaves the reviewed view fixed at188329; existing guide/plan validators then reject it. The qualification does not mean approval for every later patch. Old saved185872 plans continue to fail the current shape/decode guards. The original source checked date2026-10-20, publication metadata and source-version text stay unchanged, including the #335 leaf snapshots.

Both source notices use the existing paragraph/note styles and numeric nowrap classes. They display originalDE185872 and original checked date2026-10-20 separately from fixedDE188329 compatibility review2026-10-29, and state that no client playtest occurred. Team-plan sources state that original saved-version links require explicit rebuilding. There are no controls, layout/CSS changes, new gameplay facts or teaching recommendations. Existing unsupported/invalid states keep their guards. Acceptance covers360/375/390/1280 widths, all six cards, all three example phases, actual UI example loading, sharing/reloading and historical-link rejection, with no page/console errors or horizontal overflow.

## Reference inventory

All entries below retain their complete unit fields, civilization membership, tree status, exact predecessor and all production routes. Ages are original catalogue labels; the exhaustive route check also covers earlier-age exceptions and the spear age-label correction already in the application. A dash means no separate shape upgrade or no explicit unlock; none of the data values below is added to teaching content.

| Unit | Name       | Catalogue age | Predecessor | Shape-upgrade tech IDs | Explicit unlock | DAT production buildings |
| ---- | ---------- | ------------- | ----------- | ---------------------- | --------------- | ------------------------ |
| 74   | 民兵       | 1             | —           | —                      | —               | 12                       |
| 75   | 武士       | 2             | 74          | 222                    | —               | 12                       |
| 77   | 长剑士     | 3             | 75          | 207                    | —               | 12                       |
| 473  | 双手剑士   | 4             | 77          | 217                    | —               | 12                       |
| 567  | 冠军剑士   | 4             | 473         | 264,1174               | —               | 12                       |
| 93   | 长矛兵     | 1             | —           | —                      | —               | 12,1665                  |
| 358  | 长枪兵     | 3             | 93          | 197                    | —               | 12,1665                  |
| 359  | 长戟兵     | 4             | 358         | 429                    | —               | 12,1665                  |
| 751  | 鹰斥候     | 2             | —           | —                      | —               | 12                       |
| 753  | 鹰勇士     | 3             | 751         | 384                    | —               | 12                       |
| 752  | 精锐鹰勇士 | 4             | 753         | 434                    | —               | 12                       |
| 448  | 斥候骑兵   | 2             | —           | —                      | —               | 101                      |
| 546  | 轻型骑兵   | 3             | 448         | 254                    | —               | 101                      |
| 441  | 翼骑兵     | 4             | 546         | 428                    | —               | 101                      |
| 38   | 骑士       | 3             | —           | —                      | —               | 101                      |
| 283  | 重装骑士   | 4             | 38          | 209                    | —               | 101                      |
| 569  | 游侠       | 4             | 283         | 265                    | —               | 101                      |
| 329  | 骆驼兵     | 3             | —           | —                      | —               | 101                      |
| 330  | 重装骆驼兵 | 4             | 329         | 236                    | —               | 101                      |
| 207  | 帝王骆驼兵 | 4             | 330         | 521                    | —               | 101                      |
| 4    | 步弓手     | 2             | —           | —                      | —               | 87                       |
| 24   | 弩手       | 3             | 4           | 100                    | —               | 87                       |
| 492  | 劲弩手     | 4             | 24          | 237                    | —               | 87                       |
| 7    | 掷矛手     | 2             | —           | —                      | —               | 87                       |
| 6    | 精锐掷矛手 | 3             | 7           | 98                     | —               | 87                       |
| 39   | 骑射手     | 3             | —           | —                      | —               | 87                       |
| 474  | 重装骑射手 | 4             | 39          | 218                    | —               | 87                       |
| 1258 | 攻城锤     | 3             | —           | —                      | —               | 49                       |
| 422  | 中型冲车   | 4             | 1258        | 96                     | —               | 49                       |
| 548  | 重型冲车   | 4             | 422         | 255                    | —               | 49                       |
| 280  | 轻型投石车 | 3             | —           | —                      | —               | 49                       |
| 550  | 中型投石车 | 4             | 280         | 257                    | —               | 49                       |
| 588  | 重型投石车 | 4             | 550         | 320                    | —               | 49                       |
| 279  | 弩炮       | 3             | —           | —                      | —               | 49                       |
| 542  | 重型弩炮   | 4             | 279         | 239                    | —               | 49                       |
| 125  | 僧侣       | 3             | —           | —                      | —               | 104                      |
| 5    | 火枪手     | 4             | —           | —                      | 47              | 87                       |
| 36   | 手推炮     | 4             | —           | —                      | 47              | 49                       |
| 331  | 巨型投石机 | 4             | —           | —                      | —               | 82                       |

Full prerequisite closure (78 IDs), including all age/unlock/shape dependencies: `47,87,94,96,98,100,101,102,103,104,106,107,108,110,113,120,122,128,130,132,135,138,142,146,166,192,197,207,209,217,218,222,235,236,237,239,254,255,257,258,264,265,266,282,292,295,320,359,384,428,429,433,434,521,638,659,660,661,706,768,800,858,933,950,952,953,954,955,956,1004,1138,1141,1174,1218,1221,1222,1357,1358`. Compact numeric/mechanical payload SHA256 (both versions): `a7782dd98dceb4cad5503cb5f84a269dc2e7d85b5299efb8427a582fe78df978`.

All raw building/alias IDs audited across63 raw civs: `10,12,14,20,30,31,32,49,71,82,86,87,101,104,109,132,141,142,153,498,1665`. Together with40 unit IDs this is61 unique raw references. Comparison used genieutils-py0.1.2 full `DatFile` records after verifying both DAT hashes; all1500 full effects, all unit headers/tasks and all63 resource vectors match. Full raw tech/tech-tree differences are explicitly disposed above; compact parser equality alone was not used to claim full raw equality.

## Durable reproduction and checks

The baseline is available with `git show 7f3521c2:<path>`; the target data comes from the fixed source identities above. The SHA256 byte checks below require no upstream download:

```bash
sha256sum src/content/game-guide.json src/content/team-plan.json
npx vitest run tests/unit/teachingCompatibility486.test.ts tests/unit/gameGuide256.test.ts tests/unit/teamPlan243.test.ts tests/unit/dataMeta278.test.ts
```

The new compatibility test recomputes every digest below from committed target data, and the route digest by calling the real `planPotentialBuildings` helper for every civ/age/whitelisted unit. Digests encode `SHA256(UTF8(JSON.stringify(projection)))` using file object insertion order. Baseline and target projection digests are equal:

| Projection                       | Scope                                                                   | SHA256 for both baseline and target                                |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/data/units.json`            | Complete39 whitelist records in content order, then complete villager83 | `416854add45339048fc7aa19a6b76efa275a62d140f45dbc6f6345cb4ca295b4` |
| `src/data/techs.json`            | Complete47,101,102,103 records in that order                            | `2e9c7e21d5e2fd1bfa1a4eb6b1556a6541da359d64ef2ba4cb301233a2743a1e` |
| `src/data/buildings.json`        | Whole parsed file                                                       | `9b6b290d946512cdd421c8f7c616d601930d3f3c0bb46eb37087c8e08697e902` |
| `src/data/trees.json`            | Whole parsed file                                                       | `27cd18f2a436899f1e3ab1a31996482a9d073a8b1c698670b78466d67b50a9f8` |
| `src/data/eco.json`              | Object: units as [id,full row] for39+83; ageReq; ecoTechs; civEco       | `e62ff60130ddfd6cc17eb1b3723ccda4549bddc9ec7dc31880f70008c7014368` |
| `src/data/effects.json`          | Whole payload except meta                                               | `a78d80cc8d68ecf589b07679c46d78d51aad5d4c17664d8be30422e93d0bfc64` |
| `src/data/garrison_general.json` | Whole payload except meta                                               | `3e652ce07e4d8a03371b9f7b8b3f01af72ddcb30ed9a5a918d2665fafd452178` |
| `src/data/civs.json`             | Full Britons,Franks,Huns,Ethiopians objects in source order             | `39ad0bd93202b3c71e1ad78e7e4fe304e6f1d5b3fcaa704eac01132db301b92a` |

The proof applies to these committed inputs and the source comparisons on2026-10-29. The browser acceptance checks source notices, current interaction and link behavior; it does not establish gameplay outcomes, client validation or fresh source publication dates.
