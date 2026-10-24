import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  calculateGameClock,
  changeGameClockUnit,
  decodeGameClock,
  defaultGameClockConfig,
  encodeGameClock,
  GAME_CLOCK_DURATION_LIMIT,
  gameClockMinutes,
  gameClockRatioError,
  gameClockSeconds,
  parseGameClockDuration,
  type GameClockConfig,
  type GameClockUnit,
} from '../../domain/gameClock';
import { sharePageUrl } from '../../domain/sharePage';
import { CalcDock } from '../../shared/ui/CalcDock';
import './gameClock.css';

const SPEED_PRESETS = [
  { ratio: '1.0', name: '慢速', english: 'Slow' },
  { ratio: '1.5', name: '休闲', english: 'Casual' },
  { ratio: '1.7', name: '标准', english: 'Normal，天梯默认' },
  { ratio: '2.0', name: '快速', english: 'Fast' },
] as const;

const numberWithUnit = /^(?:\d+(?:\.\d+)?\s*(?:现实秒|游戏秒|秒|个字符|位小数))$/;
function ClockText({ text }: { text: string }) {
  return text.split(/(\d+(?:\.\d+)?\s*(?:现实秒|游戏秒|秒|个字符|位小数))/g).map((part, index) =>
    numberWithUnit.test(part) ? (
      <span className="gc-number" key={index}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export default function GameClock() {
  const location = useLocation();
  const navigate = useNavigate();
  const decoded = useMemo(() => decodeGameClock(location.search), [location.search]);
  const config = decoded.config;
  const result = calculateGameClock(config);
  const durationInvalid = !parseGameClockDuration(config.duration, config.unit).ok;
  const ratioInvalid = gameClockRatioError(config.ratio) !== null;
  const [notice, setNotice] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [unitError, setUnitError] = useState('');
  const locked = decoded.errors.length > 0;
  const gameInput = config.direction === 'game-to-real';
  const update = (next: GameClockConfig) => {
    navigate({ pathname: '/game-clock', search: '?' + encodeGameClock(next) }, { replace: true });
    setNotice('');
    setManualLink('');
    setUnitError('');
  };
  const changeUnit = (unit: GameClockUnit) => {
    const next = changeGameClockUnit(config, unit);
    if (next.error) setUnitError(next.error);
    else update(next.config);
  };
  const share = async () => {
    if (locked || !result.ok) return;
    const url = sharePageUrl('/game-clock', '?' + encodeGameClock(config), document.baseURI);
    try {
      await navigator.clipboard.writeText(url);
      setNotice('换算链接已复制，包含原始时长、单位、方向和倍率。');
      setManualLink('');
    } catch {
      setNotice('自动复制失败，请手动复制下方链接。');
      setManualLink(url);
    }
  };
  return (
    <section className="pane game-clock-page" data-testid="game-clock-page">
      <header className="gc-heading">
        <div>
          <p className="note">读懂攻略里的时间</p>
          <h1>游戏与现实时间换算</h1>
          <p>填入你使用的速度倍率，把游戏时长和理论现实时长相互换算。</p>
        </div>
      </header>
      <CalcDock
        note={notice}
        resultId={locked ? undefined : 'gc-result-title'}
        actions={[
          { label: '复制换算链接', icon: 'copy', disabled: locked || !result.ok, onClick: () => void share() },
          { label: '重置换算', onClick: () => update(defaultGameClockConfig()) },
        ]}
      />
      <aside className="gc-intro" aria-label="时钟口径">
        <strong>攻略时点通常使用游戏时钟</strong>
        <p>
          倍率表示每经过 <span className="gc-number">1 现实秒</span>，游戏经过多少秒。默认使用标准速度（天梯默认），倍率为{' '}
          <span className="gc-number">1.7</span>；可选预设或手动填写。
        </p>
        <p className="note">换算只适用于倍率恒定、连续运行的情况，不能还原暂停、变速或卡顿后的实际对局耗时。</p>
      </aside>
      {locked ? (
        <div className="gc-error" role="alert">
          <h2>换算链接无法读取</h2>
          <p>{decoded.errors.join(' ')}</p>
        </div>
      ) : (
        <div className="gc-layout">
          <section className="gc-panel" aria-labelledby="gc-input-title">
            <h2 id="gc-input-title">填写时长与倍率</h2>
            <label>
              换算方向
              <select value={config.direction} onChange={(event) => update({ ...config, direction: event.target.value as GameClockConfig['direction'] })}>
                <option value="game-to-real">游戏时间换成现实时间</option>
                <option value="real-to-game">现实时间换成游戏时间</option>
              </select>
            </label>
            <label>
              输入单位
              <select value={config.unit} onChange={(event) => changeUnit(event.target.value as GameClockUnit)}>
                <option value="minutes">分:秒</option>
                <option value="seconds">秒</option>
              </select>
            </label>
            <label>
              {gameInput ? '原始游戏时长' : '原始现实时长'}
              <input
                type="text"
                inputMode={config.unit === 'seconds' ? 'decimal' : 'text'}
                value={config.duration}
                maxLength={64}
                placeholder={config.unit === 'minutes' ? '例如 10:00' : '例如 600'}
                aria-invalid={durationInvalid}
                aria-describedby="gc-duration-help"
                onChange={(event) => update({ ...config, duration: event.target.value })}
              />
            </label>
            <p className="note" id="gc-duration-help">
              {config.unit === 'minutes' ? '按“分:秒”填写，秒位为 00–59，可加小数，如 0:05.5。' : '填写非负十进制秒数，可加小数。'}最多{' '}
              <span className="gc-number">{`${GAME_CLOCK_DURATION_LIMIT} 秒`}</span>。
            </p>
            <label>
              速度倍率
              <input
                type="text"
                inputMode="decimal"
                value={config.ratio}
                maxLength={64}
                aria-invalid={ratioInvalid}
                aria-describedby="gc-ratio-help"
                onChange={(event) => update({ ...config, ratio: event.target.value })}
              />
            </label>
            <p className="note" id="gc-ratio-help">
              大于 <span className="gc-number">0</span>、不超过 <span className="gc-number">1000</span>。每现实秒对应的游戏秒数；请按自己的设置填写。
            </p>
            <div className="gc-presets" role="group" aria-label="游戏速度预设">
              {SPEED_PRESETS.map((preset) => (
                <button
                  key={preset.ratio}
                  type="button"
                  aria-label={`${preset.ratio} ${preset.name}（${preset.english}）`}
                  aria-pressed={!ratioInvalid && Number(config.ratio) === Number(preset.ratio)}
                  onClick={() => update({ ...config, ratio: preset.ratio })}
                >
                  <span className="gc-number">{`${preset.ratio} ${preset.name}`}</span>
                </button>
              ))}
            </div>
            {unitError && (
              <p role="alert" className="gc-error">
                <ClockText text={unitError} />
              </p>
            )}
            <div className="gc-actions">
              <button type="button" className="btn" onClick={() => update(defaultGameClockConfig())}>
                试算数学示例
              </button>
            </div>
            <p className="note">
              示例采用标准速度（天梯默认），倍率为 <span className="gc-number">1.7</span>。
            </p>
          </section>
          <section className="gc-panel gc-result" aria-labelledby="gc-result-title" aria-live="polite">
            <h2 id="gc-result-title" className="calc-dock-target" tabIndex={-1}>
              {gameInput ? '理论现实时长' : '对应游戏时长'}
            </h2>
            {!result.ok ? (
              <div role="alert" className="gc-error">
                <strong>请修正输入，暂不计算</strong>
                <ul>
                  {result.errors.map((error) => (
                    <li key={error}>
                      <ClockText text={error} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <p className="gc-clock gc-number" data-testid="game-clock-result">
                  {gameClockMinutes(result.outputSeconds)}
                </p>
                <p className="note">分:秒，四舍五入到整秒</p>
                <p className="gc-seconds">
                  <span className="gc-number" data-testid="game-clock-seconds">{`${gameClockSeconds(result.outputSeconds)} 秒`}</span>
                </p>
                <p className="note">
                  秒数最多显示 <span className="gc-number">6 位小数</span>；更小的正数用科学记数法显示。计算使用未取整值。
                </p>
                <dl className="gc-equation">
                  <div>
                    <dt>原始输入</dt>
                    <dd>
                      <span className="gc-number">{`${gameClockSeconds(result.inputSeconds)} ${gameInput ? '游戏秒' : '现实秒'}`}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>用户倍率</dt>
                    <dd>
                      <span className="gc-number">{String(result.ratio)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>计算方式</dt>
                    <dd>{gameInput ? '游戏秒数除以倍率' : '现实秒数乘以倍率'}</dd>
                  </div>
                </dl>
                <p className="note">切换方向会保留原始时长并改变其含义；切换单位会换写同一段原始时长，不会把结果再次换算。</p>
              </>
            )}
          </section>
        </div>
      )}
      {manualLink && (
        <label className="gc-manual-link">
          手动复制换算链接
          <input readOnly value={manualLink} onFocus={(event) => event.target.select()} />
        </label>
      )}
      <details className="gc-panel gc-method">
        <summary>换算规则与适用范围</summary>
        <p>
          游戏时间除以速度倍率得到理论现实时间，现实时间乘以速度倍率得到游戏时间。这里只做时钟算术，不读取游戏，也不改变本站开局、施工、生产、商路或治疗模型的游戏时间。
        </p>
        <p>
          输入时长最多 <span className="gc-number">{`${GAME_CLOCK_DURATION_LIMIT} 秒`}</span>，倍率大于 <span className="gc-number">0</span> 且不超过{' '}
          <span className="gc-number">1000</span>；换算结果超过安全整数秒范围时暂停显示。空值、负数、指数写法与非法分秒需要先修正。
        </p>
        <p>
          决定版速度预设：慢速（Slow）<span className="gc-number">1.0</span>、休闲（Casual）<span className="gc-number">1.5</span>、 标准（Normal）
          <span className="gc-number">1.7</span>、快速（Fast）<span className="gc-number">2.0</span>。天梯与比赛使用标准速度， 本页默认倍率为{' '}
          <span className="gc-number">1.7</span>。
        </p>
        <p>
          来源：<a href="https://forums.ageofempires.com/t/whats-the-equivalent-to-1-5-game-speed-in-aoe2-de/84298">帝国时代官方论坛：DE 游戏速度讨论</a>（
          <span className="gc-number">2020 年</span>），帖中说明 Normal 为 <span className="gc-number">1.7</span>、Casual 为{' '}
          <span className="gc-number">1.5</span>，Normal 是多人游戏的标准速度。
        </p>
        <nav className="gc-links" aria-label="相关工具">
          <Link to="/builds">开局流程</Link>
          <Link to="/construction">多人施工</Link>
          <Link to="/trade-income">商路供给</Link>
          <Link to="/garrison-healing">驻军回血</Link>
        </nav>
      </details>
    </section>
  );
}
