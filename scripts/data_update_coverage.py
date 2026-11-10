#!/usr/bin/env python3
"""数据更新覆盖清单。只读源码和清单，不跑生成器，不下载 .dat，不改 pin。

用法：python3 scripts/data_update_coverage.py
npm run data:update / data:status 会在接触网络和生成器之前调用 check()。
清单：scripts/data_update_coverage.json。说明：docs/DATA-UPDATE.md。
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = 'scripts/data_update_coverage.json'
DOC_PATH = 'docs/DATA-UPDATE.md'
RUNNERS = {'node', 'npx', 'vite-node'}
PATH_PREFIXES = ('scripts/', 'src/', 'docs/', 'tests/', '.github/')


def read_text(root: Path, rel: str, sources: dict[str, str] | None) -> str:
    if sources is not None and rel in sources:
        return sources[rel]
    return (root / rel).read_text(encoding='utf-8')


def load_manifest(root: Path, manifest: dict | None, sources: dict[str, str] | None) -> dict:
    if manifest is not None:
        return manifest
    return json.loads(read_text(root, MANIFEST_PATH, sources))


def assigned_value(source: str, name: str):
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return ast.literal_eval(node.value)
    raise ValueError(f'找不到赋值 {name}')


def is_run_call(node: ast.AST) -> bool:
    return isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'run'


def function_named(tree: ast.AST, name: str) -> ast.FunctionDef:
    for node in getattr(tree, 'body', []):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    raise ValueError(f'找不到函数 {name}')


def run_step(call: ast.Call) -> dict:
    strings: list[str] = []
    template = None
    for arg in call.args:
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            strings.append(arg.value)
        elif isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Mod):
            template = arg
        elif isinstance(arg, ast.Attribute):
            continue
        else:
            raise ValueError(f'无法识别的 run 参数：{ast.unparse(arg)}')
    if template is not None:
        raise ValueError('run 的路径模板必须位于 for 循环内')
    script = None
    args: list[str] = []
    for value in strings:
        if value.startswith('scripts/'):
            if script:
                raise ValueError(f'一条 run 有两个脚本：{script} 与 {value}')
            script = value
        elif value in RUNNERS:
            continue
        else:
            args.append(value)
    if not script:
        raise ValueError(f'run 没有 scripts/ 路径：{ast.unparse(call)}')
    return {'script': script, 'args': args}


def expand_for(stmt: ast.For, when: str) -> list[dict]:
    if not isinstance(stmt.iter, (ast.Tuple, ast.List)):
        raise ValueError('生成器 for 的名单必须是字面量')
    names = []
    for elt in stmt.iter.elts:
        if not isinstance(elt, ast.Constant) or not isinstance(elt.value, str):
            raise ValueError('生成器 for 的名单必须是字符串')
        names.append(elt.value)
    runs = [node for node in ast.walk(stmt) if is_run_call(node)]
    if len(runs) != 1:
        raise ValueError('生成器 for 必须恰好有一条 run')
    call = runs[0]
    templates = [arg for arg in call.args if isinstance(arg, ast.BinOp) and isinstance(arg.op, ast.Mod)]
    if len(templates) != 1:
        raise ValueError('生成器 for 的 run 必须使用一条 % 路径模板')
    left = templates[0].left
    if not isinstance(left, ast.Constant) or left.value != 'scripts/%s_build.py':
        raise ValueError('生成器 for 的路径模板必须是 scripts/%s_build.py')
    return [{'script': f'scripts/{name}_build.py', 'args': [], 'when': when} for name in names]


def orchestration_steps(source: str) -> list[dict]:
    tree = ast.parse(source)
    main = function_named(tree, 'main')
    steps: list[dict] = []

    def walk(stmts: list[ast.stmt], when: str) -> None:
        for stmt in stmts:
            if isinstance(stmt, ast.Try) or any(isinstance(node, ast.Try) for node in ast.walk(stmt)):
                if any(is_run_call(node) for node in ast.walk(stmt)):
                    raise ValueError('run 被 try 包住，生成失败不能继续')
            if isinstance(stmt, ast.If):
                cond = ast.unparse(stmt.test)
                body_has_run = any(is_run_call(node) for node in ast.walk(ast.Module(body=stmt.body, type_ignores=[])))
                walk(stmt.body, cond if body_has_run else when)
                if stmt.orelse:
                    walk(stmt.orelse, cond)
                continue
            if isinstance(stmt, ast.For):
                if any(is_run_call(node) for node in ast.walk(stmt)):
                    steps.extend(expand_for(stmt, when))
                continue
            if isinstance(stmt, ast.Expr) and is_run_call(stmt.value):
                step = run_step(stmt.value)
                step['when'] = when
                steps.append(step)
                continue
            if any(is_run_call(node) for node in ast.walk(stmt)):
                raise ValueError(f'无法归类的 run：{ast.unparse(stmt)[:180]}')

    walk(main.body, 'always')
    return steps


def is_subprocess_run(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == 'run'
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == 'subprocess'
    )


def require_check(call: ast.Call) -> None:
    checked = any(kw.arg == 'check' and isinstance(kw.value, ast.Constant) and kw.value.value is True for kw in call.keywords)
    if not checked:
        raise ValueError('build_data.py 的 subprocess.run 缺少 check=True')


def script_from_subprocess(call: ast.Call) -> str:
    if not call.args or not isinstance(call.args[0], ast.List):
        raise ValueError(f'无法识别 build_data.py 的 subprocess.run：{ast.unparse(call)}')
    scripts = [arg.value for arg in call.args[0].elts if isinstance(arg, ast.Constant) and isinstance(arg.value, str) and arg.value.startswith('scripts/')]
    if len(scripts) != 1:
        raise ValueError(f'无法识别 build_data.py 的 subprocess.run：{ast.unparse(call)}')
    return scripts[0]


def nested_scripts(source: str) -> list[str]:
    tree = ast.parse(source)
    found: list[str] = []
    seen: list[ast.Call] = []
    loop_runs = 0
    for node in tree.body:
        if isinstance(node, ast.For) and isinstance(node.iter, ast.List):
            calls = [child for child in ast.walk(node) if is_subprocess_run(child)]
            if not calls:
                continue
            if len(calls) != 1:
                raise ValueError('build_data.py 的生成器 for 必须恰好一条 subprocess.run')
            require_check(calls[0])
            seen.append(calls[0])
            loop_runs += 1
            for elt in node.iter.elts:
                if not isinstance(elt, ast.Constant) or not isinstance(elt.value, str):
                    raise ValueError('build_data.py 的生成器名单必须是字符串')
                found.append('scripts/' + elt.value)
        elif isinstance(node, ast.Expr) and is_subprocess_run(node.value):
            require_check(node.value)
            seen.append(node.value)
            found.append(script_from_subprocess(node.value))
    all_runs = [node for node in ast.walk(tree) if is_subprocess_run(node)]
    if len(all_runs) != len(seen):
        raise ValueError('build_data.py 有无法归类的 subprocess.run')
    if loop_runs != 1:
        raise ValueError('build_data.py 必须用恰好一个 for 调用成批生成器')
    return found


def context_prefixes(source: str) -> list[str]:
    tree = ast.parse(source)
    found = []
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else []
        for target in targets:
            if isinstance(target, ast.Name) and target.id.endswith('_CONTEXT_TECHS'):
                found.append(target.id[: -len('_CONTEXT_TECHS')])
    return found


def mechanism_keys(source: str) -> list[str]:
    start = source.find('export const CIV_MECHANISMS')
    end = source.find('export const CIV_MECHANISM_KEYS')
    if start < 0 or end < start:
        raise ValueError('找不到 CIV_MECHANISMS')
    return re.findall(r'^  ([A-Z][A-Za-z0-9]*): ', source[start:end], re.M)


def economy_imports(source: str) -> list[str]:
    return re.findall(r"""from ['\"]\./([A-Za-z0-9]+Economy)['\"]""", source)


def run_fails_closed(source: str) -> bool:
    tree = ast.parse(source)
    fn = function_named(tree, 'run')
    if any(isinstance(node, ast.Try) for node in ast.walk(tree)):
        return False
    for node in ast.walk(fn):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'run':
            if any(kw.arg == 'check' and isinstance(kw.value, ast.Constant) and kw.value.value is True for kw in node.keywords):
                return True
    return False


def coverage_wired(source: str, stop_message: str) -> bool:
    tree = ast.parse(source)
    main = function_named(tree, 'main')
    imported = False
    called = False
    for node in ast.walk(main):
        if isinstance(node, ast.ImportFrom) and node.module == 'data_update_coverage':
            imported = any(alias.name == 'check' for alias in node.names)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'check':
            called = True
    return imported and called and stop_message in source


def manifest_paths(manifest: dict) -> list[str]:
    found: list[str] = []

    def walk(node) -> None:
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
        elif isinstance(node, str) and node.startswith(PATH_PREFIXES):
            found.append(node)

    walk(manifest)
    unique = []
    for path in found:
        if path not in unique:
            unique.append(path)
    return unique


def compare_steps(actual: list[dict], manifest: dict) -> list[str]:
    errors = []
    conditions = manifest['conditions']
    expected = []
    for step in manifest['orchestrated']:
        when = step['when']
        if when == 'always':
            expression = 'always'
        elif when not in conditions:
            errors.append(f'漏登记：编排条件 {when} 没有写在 conditions')
            expression = when
        else:
            expression = conditions[when]
        expected.append((step['script'], tuple(step.get('args') or []), expression))
    got = [(step['script'], tuple(step['args']), step['when']) for step in actual]
    if got != expected:
        errors.append('编排漂移：data_update.py 的运行顺序与覆盖清单不一致')
        errors.append('实际：' + ' | '.join(f'{script}{list(args)}@{when}' for script, args, when in got))
        errors.append('清单：' + ' | '.join(f'{script}{list(args)}@{when}' for script, args, when in expected))
    return errors


def classify_builds(build_names: list[str], manifest: dict) -> list[str]:
    classified = set()
    for step in manifest['orchestrated']:
        name = Path(step['script']).name
        if name.endswith('_build.py'):
            classified.add(name)
    for step in manifest['nestedInBuildData']:
        name = Path(step['script']).name
        if name.endswith('_build.py'):
            classified.add(name)
    for step in manifest['intentionalSkips']:
        name = Path(step['script']).name
        if name.endswith('_build.py'):
            classified.add(name)
    errors = []
    for name in build_names:
        if name not in classified:
            errors.append(f'漏登记：scripts/{name} 未列入编排、嵌套或故意不跑')
    known = {Path(step['script']).name for step in manifest['orchestrated'] + manifest['nestedInBuildData'] + manifest['intentionalSkips']}
    for name in sorted(classified):
        if name not in build_names and name in known:
            errors.append(f'编排漂移：清单登记了 scripts/{name}，仓库里没有这个文件')
    return errors


def check(
    root: Path | None = None,
    *,
    manifest: dict | None = None,
    sources: dict[str, str] | None = None,
    extra_build_scripts: list[str] | None = None,
    extra_economy: list[str] | None = None,
) -> list[str]:
    root = root or ROOT
    errors: list[str] = []
    try:
        data = load_manifest(root, manifest, sources)
    except (OSError, json.JSONDecodeError, UnicodeError) as exc:
        return [f'漏登记：无法读取覆盖清单：{exc}']
    if data.get('schemaVersion') != 1:
        errors.append('漏登记：覆盖清单 schemaVersion 必须为 1')

    def text(rel: str) -> str:
        try:
            return read_text(root, rel, sources)
        except OSError as exc:
            errors.append(f'漏登记：找不到 {rel}：{exc}')
            return ''

    data_update = text('scripts/data_update.py')
    build_data = text('scripts/build_data.py')
    try:
        actual = orchestration_steps(data_update) if data_update else []
        errors.extend(compare_steps(actual, data))
    except (SyntaxError, ValueError) as exc:
        errors.append(f'编排漂移：无法解析 data_update.py 的运行步骤：{exc}')
    try:
        nested = nested_scripts(build_data) if build_data else []
        expected_nested = [step['script'] for step in data['nestedInBuildData']]
        if nested != expected_nested:
            errors.append('编排漂移：build_data.py 的嵌套生成器与覆盖清单不一致')
            errors.append('实际：' + ' | '.join(nested))
            errors.append('清单：' + ' | '.join(expected_nested))
    except (SyntaxError, ValueError) as exc:
        errors.append(f'编排漂移：无法解析 build_data.py：{exc}')

    builds = sorted(path.name for path in (root / 'scripts').glob('*_build.py'))
    builds.extend(extra_build_scripts or [])
    errors.extend(classify_builds(builds, data))
    skip_scripts = {step['script'] for step in data['intentionalSkips']}
    direct_scripts = {step['script'] for step in data['orchestrated']}
    nested_set = {step['script'] for step in data['nestedInBuildData']}
    for script in sorted(skip_scripts & (direct_scripts | nested_set)):
        errors.append(f'编排漂移：{script} 不能同时列入故意不跑和实际运行')
    for required in ('scripts/patches_build.py', 'scripts/history_build.py', 'scripts/map_previews.py', 'scripts/map_catalog_build.py'):
        if required not in skip_scripts:
            errors.append(f'漏登记：{required} 必须列入故意不跑')
    for basename in ('patches_build.py', 'history_build.py', 'map_previews.py', 'map_catalog_build.py', 'src/data/patches'):
        if basename in data_update:
            errors.append(f'补丁历史：data_update.py 不得写入或调用 {basename}')
    if 'PATCH-NOTES' not in data_update:
        errors.append('编排漂移：data_update.py 不再写 docs/PATCH-NOTES')
    stop_message = data.get('failFast', {}).get('stopMessage', '')
    try:
        if not run_fails_closed(data_update):
            errors.append('失败即停：data_update.run 必须使用 subprocess.run(..., check=True)，且不能用 try 吞掉失败')
        if not stop_message or not coverage_wired(data_update, stop_message):
            errors.append('失败即停：data_update.main 必须在生成前调用覆盖检查，失败则停止且不运行生成器')
    except (SyntaxError, ValueError) as exc:
        errors.append(f'失败即停：无法解析 data_update.py 的失败即停结构：{exc}')

    civs = text('scripts/civs_build.py')
    try:
        if civs and any(isinstance(node, ast.Try) for node in ast.walk(ast.parse(civs))):
            errors.append('失败即停：civs_build.py 用 try 包住了校正逻辑，不能静默跳过')
    except SyntaxError as exc:
        errors.append(f'失败即停：无法解析 civs_build.py：{exc}')
    for message in data.get('failFast', {}).get('civTextMessages', []):
        if message not in civs:
            errors.append(f'失败即停：civs_build.py 缺少校正失败即停的语句：{message}')

    for item in data['humanItems']:
        path = item['path']
        evidence_rel = item.get('evidenceFile', path)
        evidence = text(evidence_rel)
        if item['ownerEvidence'] not in evidence:
            errors.append(f'漏登记：{item["id"]} 的主人证据不在 {evidence_rel}')
        if not str(item.get('owner', '')).strip():
            errors.append(f'漏登记：{item["id"]} 没有主人')
        if item['id'] == 'build-orders':
            directory = root / path
            files = sorted(directory.glob('*.json')) if directory.is_dir() else []
            if not files:
                errors.append(f'漏登记：{path} 没有开局 JSON')
            for file in files:
                try:
                    row = json.loads(file.read_text(encoding='utf-8'))
                except json.JSONDecodeError:
                    errors.append(f'漏登记：{file.relative_to(root)} 不是 JSON')
                    continue
                authors = [source.get('author', '') for source in row.get('sources') or [] if isinstance(source, dict)]
                reviewer = (row.get('review') or {}).get('by', '') if isinstance(row.get('review'), dict) else ''
                if not any(isinstance(author, str) and author.strip() for author in authors) or not isinstance(reviewer, str) or not reviewer.strip():
                    errors.append(f'漏登记：{file.relative_to(root)} 缺少 sources[].author 或 review.by')
        elif item['id'] == 'stats-allowlist':
            try:
                parsed = json.loads(text(path))
            except json.JSONDecodeError:
                errors.append(f'漏登记：{path} 不是 JSON')
                parsed = None
            if not isinstance(parsed, list):
                errors.append(f'漏登记：{path} 必须是数组')
        elif item['id'] == 'map-editorial':
            if '"source": "editorial"' not in text(path):
                errors.append(f'漏登记：{path} 没有 editorial 编辑文案')
        elif not (root / path).is_file() and not (sources and path in sources):
            errors.append(f'漏登记：找不到人工项 {path}')

    for item in data['prohibitedManualOverrides']:
        if item['ownerEvidence'] not in text(item['path']):
            errors.append(f'漏登记：{item["path"]} 的回退说明变了')
    guard = data['runtimeGuard']
    guard_text = text(guard['file'])
    if guard_text.count(guard['snippet']) < guard['minimum']:
        errors.append(f'编排漂移：{guard["file"]} 不再在 .dat 已有战斗规则时跳过手工表')

    mechanisms = data['civMechanisms']
    mechanism_file = next(item['file'] for item in mechanisms['registries'] if item['symbol'] == 'CIV_MECHANISMS')
    mechanism_text = text(mechanism_file)
    try:
        keys = mechanism_keys(mechanism_text) if mechanism_text else []
    except ValueError as exc:
        keys = []
        errors.append(f'漏登记：{exc}')
    key_set = set(keys)
    eco = text(mechanisms['contextTechFile'])
    try:
        prefixes = context_prefixes(eco) if eco else []
    except SyntaxError as exc:
        prefixes = []
        errors.append(f'漏登记：无法解析 eco_build.py：{exc}')
    aliases = mechanisms['contextTechAliases']
    for prefix in prefixes:
        civ = aliases.get(prefix)
        if not civ:
            errors.append(f'漏登记：eco_build.py 的 {prefix}_CONTEXT_TECHS 没有文明别名，不能静默忽略')
        elif civ not in key_set:
            errors.append(f'漏登记：{prefix}_CONTEXT_TECHS 对应 {civ}，但 CIV_MECHANISMS 没有这个文明')
    for prefix, civ in aliases.items():
        if prefix not in prefixes:
            errors.append(f'编排漂移：上下文科技别名 {prefix} 在 eco_build.py 中已经不存在')
        if civ not in key_set:
            errors.append(f'漏登记：上下文科技别名 {civ} 不在 CIV_MECHANISMS')
    for registry in mechanisms['registries']:
        body = text(registry['file'])
        if registry['symbol'] not in body:
            errors.append(f'漏登记：{registry["file"]} 缺少 {registry["symbol"]}')
    for rel in mechanisms['existingChecks']:
        body = text(rel)
        if 'CIV_MECHANISMS' not in body and 'checkRegistries' not in body:
            errors.append(f'漏登记：已有机制检查 {rel} 不再检查注册表')
    imported = set(economy_imports(mechanism_text))
    economy_files = [path.name for path in (root / 'src/domain').glob('*Economy.ts')]
    economy_files.extend(extra_economy or [])
    for name in economy_files:
        stem = name.removesuffix('.ts')
        if stem not in imported:
            errors.append(f'漏登记：src/domain/{name} 没有被 buildSimMechanisms.ts import')
    for stem in sorted(imported):
        if not (root / 'src/domain' / f'{stem}.ts').is_file():
            errors.append(f'漏登记：buildSimMechanisms.ts import 了不存在的 {stem}.ts')

    cost = data['costBonuses']
    if cost.get('status') != 'current-dual-track' or cost.get('pendingIssue') != 864:
        errors.append('编排漂移：费用加成仍须标成 current-dual-track，并把统一函数留给 #864')
    for rel in cost['mustBeProducedBy']:
        if rel not in direct_scripts:
            errors.append(f'漏登记：费用类加成的生成器 {rel} 不在编排里')
    if cost['effectsEvidence'] not in text('scripts/effects_build.py'):
        errors.append('编排漂移：effects_build.py 不再写 costDiscounts')
    if cost['ecoEvidence'] not in text('scripts/eco_build.py'):
        errors.append('编排漂移：eco_build.py 的费用说明变了')
    for evaluator in cost['currentEvaluators']:
        body = text(evaluator['file'])
        if evaluator['evidence'] not in body:
            errors.append(f'漏登记：{evaluator["file"]} 缺少当前求值入口 {evaluator["symbol"]}')
        must_call = evaluator.get('mustCall')
        if must_call and must_call not in body:
            errors.append(f'编排漂移：{evaluator["symbol"]} 不再调用 {must_call}')

    try:
        pins = json.loads(text('scripts/data_sources.json'))
    except json.JSONDecodeError as exc:
        pins = {}
        errors.append(f'补丁历史：无法解析 data_sources.json：{exc}')
    history = data['patchHistory']
    pin_build = (pins.get('patch') or {}).get('build')
    if pin_build != history['pinBuildIs']:
        errors.append(
            f'补丁历史：当前 pin 已变为 {pin_build}。不要改写 src/data/patches/188329.json 或 patches_188329.py 的锁定身份。'
            '请新增补丁档案文件，并分开更新覆盖清单；188329 的 identity 必须保持不变。'
        )
    asset_sources = pins.get('assetSources') or {}
    if 'mapPreviews' not in asset_sources:
        errors.append('漏登记：data_sources.json 缺少 assetSources.mapPreviews')
    def locked(build: str) -> dict | None:
        matches = [item for item in history['locked'] if item['build'] == build]
        if len(matches) != 1:
            errors.append(f'漏登记：覆盖清单必须恰好有一份 {build} 档案')
            return None
        return matches[0]

    locked_188329 = locked('188329')
    if locked_188329:
        module = text(locked_188329['module'])
        if locked_188329['assertText'] not in module:
            errors.append('补丁历史：patches_188329.py 必须继续断言 pin 就是 188329，不能改成跟随当前 pin')
        try:
            commits = assigned_value(module, 'FIXED_COMMITS')
            digest = assigned_value(module, 'DAT_SHA256')
            identity = locked_188329['identity']
            if commits != {key: identity[key] for key in ('dat', 'aoe2techtree', 'halfon')} or digest != identity['datSha256']:
                errors.append('补丁历史：188329 的 FIXED_COMMITS 或 DAT_SHA256 与覆盖清单不一致，不能改写这份历史')
            if pin_build == 188329:
                source_commits = {key: value['commit'] for key, value in pins['sources'].items()}
                if source_commits != commits or pins['sources']['dat']['sha256'] != digest:
                    errors.append('补丁历史：当前 pin 与 188329 锁定身份不一致')
        except (SyntaxError, ValueError, KeyError, TypeError) as exc:
            errors.append(f'补丁历史：无法核对 188329 锁定身份：{exc}')
    locked_185872 = locked('185872')
    if locked_185872:
        try:
            historical = assigned_value(text(locked_185872['module']), locked_185872['constant'])
            if historical != locked_185872['sha256']:
                errors.append('补丁历史：185872 的 HISTORICAL_SHA256 与覆盖清单不一致')
        except (SyntaxError, ValueError) as exc:
            errors.append(f'补丁历史：无法核对 185872：{exc}')
    try:
        history_keys = list(assigned_value(text(history['historyScript']), 'PATCHES'))
    except (SyntaxError, ValueError) as exc:
        history_keys = []
        errors.append(f'补丁历史：无法读取 history_build.PATCHES：{exc}')
    if history_keys != history['historyBuilds']:
        errors.append('编排漂移：history_build.py 的历史版本与覆盖清单不一致')
    if '188329' in history_keys or '185872' in history_keys:
        errors.append('补丁历史：history_build.py 不能收编 185872 或 188329')
    for rel in [item['output'] for item in history['locked'] if item.get('output')] + history['historyOutputs']:
        raw = text(rel)
        try:
            archive_id = json.loads(raw).get('id') if raw else None
        except json.JSONDecodeError:
            archive_id = None
        build = Path(rel).stem
        if archive_id != build:
            errors.append(f'补丁历史：{rel} 的 id 不是 {build}')

    doc = text(DOC_PATH)
    for path in manifest_paths(data):
        if path not in doc:
            errors.append(f'漏登记：{DOC_PATH} 没有写明 {path}')
    for key in ('command', 'npm', 'status', 'checkCommand'):
        command = data['entry'][key]
        if command not in doc:
            errors.append(f'漏登记：{DOC_PATH} 未写入口 {command}')
    for item in data['notThisIssue']:
        if f'#{item["issue"]}' not in doc:
            errors.append(f'漏登记：{DOC_PATH} 未写明边界 #{item["issue"]}')
    if '当前事实' not in doc or '待落地' not in doc:
        errors.append(f'漏登记：{DOC_PATH} 必须分开写当前事实和待落地项')

    try:
        package = json.loads(text('package.json'))
    except json.JSONDecodeError as exc:
        package = {}
        errors.append(f'编排漂移：无法解析 package.json：{exc}')
    scripts = package.get('scripts') or {}
    for name, command in data['ci']['packageScripts'].items():
        if scripts.get(name) != command:
            errors.append(f'编排漂移：package.json 的 {name} 不再是 {command}')
    workflow_dir = root / data['ci']['workflowDir']
    if workflow_dir.is_dir():
        for workflow in sorted(workflow_dir.glob('*.yml')):
            body = workflow.read_text(encoding='utf-8')
            for token in data['ci']['mustNotReference']:
                if token in body:
                    errors.append(f'编排漂移：{workflow.relative_to(root)} 引用了 {token}。默认 CI 不跑这份清单')
    else:
        errors.append(f'漏登记：找不到 {data["ci"]["workflowDir"]}')

    return errors


def main() -> None:
    errors = check()
    if errors:
        print('数据更新覆盖清单：失败')
        for error in errors:
            print('✗ ' + error)
        raise SystemExit(1)
    manifest = json.loads((ROOT / MANIFEST_PATH).read_text(encoding='utf-8'))
    conditional = sum(1 for step in manifest['orchestrated'] if step['when'] != 'always')
    print('数据更新覆盖清单：通过')
    print(f'编排 {len(manifest["orchestrated"])} 步，其中 {conditional} 步只在 dat、aoe2techtree 变更或 --force 时运行')
    print(f'嵌套 {len(manifest["nestedInBuildData"])} 步（build_data.py）')
    print(f'故意不跑 {len(manifest["intentionalSkips"])} 个')
    print(f'人工项 {len(manifest["humanItems"])} 个')
    print(f'上下文科技别名 {len(manifest["civMechanisms"]["contextTechAliases"])} 个')
    print('未运行生成器，未下载或更新 pin')


if __name__ == '__main__':
    main()
