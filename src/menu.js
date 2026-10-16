// FAULTLINE start / pause / finish menu. Pure DOM; the game passes in what the menu needs to read and do.
export const EMBLEM_PATHS =
  '<path class="e-a" d="M0 0H100V24H34V38H90V48L0 75Z"/><path class="e-f" d="M42 70L98 53V63L42 80Z"/><path class="e-b" d="M0 85L34 75V91L0 101Z"/>';

const clean = (name) => name.replace(/^\S+\s/, '');
const hex = (c) => `#${c.getHexString()}`;

export function createMenu(api) {
  const root = document.getElementById('menu');
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const panelEl = $('.mpanel');
  const slash = document.querySelector('.slash');
  let state = 'title', panel = null, hideTimer = 0, result = null, shown = true;

  $$('[data-emblem]').forEach((el) => (el.innerHTML = EMBLEM_PATHS));

  // ---- panels ----
  const TITLES = { map: '01 / Map', env: '02 / Conditions', records: '03 / Best times', howto: '04 / How to play' };
  function openPanel(p) {
    panel = p;
    panelEl.classList.toggle('open', !!p);
    root.classList.toggle('panel', !!p);
    $$('.mnav button').forEach((b) => b.classList.toggle('on', b.dataset.panel === p));
    $$('.mpanel section').forEach((s) => s.classList.toggle('on', s.dataset.panel === p));
    if (p) $('[data-v="ptitle"]').textContent = TITLES[p];
  }

  function renderMaps() {
    $('.maps').innerHTML = api.maps.map((m, i) => {
      const best = api.bestTime(i);
      return `<button class="mcard${i === api.mapIndex() ? ' on' : ''}" data-map="${i}">` +
        `<span class="n">0${i + 1}</span><span class="name">${clean(m.name)}</span><span class="desc">${m.desc}</span>` +
        `<span class="meta">11 items · ${best ? `best ${best}` : 'no record yet'}</span><span class="tag">Selected</span></button>`;
    }).join('');
  }

  function renderEnvs() {
    const stops = api.envs.filter((e) => e.p).map((e) => hex(e.p.top));
    $('.envgrid').innerHTML = api.envs.map((e, i) => {
      let sky;
      if (!e.p) {
        sky = `<span class="sky" style="background:linear-gradient(90deg,${stops.join(',')});--ground:#2a2a26"></span>`;
      } else {
        const p = e.p, top = 78 - Math.min(p.elev, 60) * 1.1;
        const orb = p.moon ? `<i class="orb" style="left:70%;top:24%;background:#e8ecff;box-shadow:0 0 18px 4px #9db4ff88"></i>`
          : p.disc ? `<i class="orb" style="left:${p.elev < 15 ? 62 : 30}%;top:${top}%;background:${hex(p.sun)};box-shadow:0 0 24px 8px ${hex(p.sun)}99"></i>` : '';
        sky = `<span class="sky" style="background:linear-gradient(${hex(p.top)},${hex(p.hor)} 78%);--ground:${hex(p.hg)}">${orb}` +
          `${p.rain ? '<i class="rain"></i>' : ''}${p.fogNear < 5 ? '<i class="haze"></i>' : ''}</span>`;
      }
      return `<button class="etile${i === api.envIndex() ? ' on' : ''}" data-env="${i}">${sky}<span class="lbl">${clean(e.name)}</span></button>`;
    }).join('');
  }

  function setText(sel, v) { $$(sel).forEach((el) => (el.textContent = v)); }

  function sync() {
    const map = clean(api.maps[api.mapIndex()].name), env = clean(api.envs[api.envIndex()].name);
    setText('[data-v="map"]', map);
    setText('[data-v="env"]', env);
    setText('[data-v="best"]', api.bestTime(api.mapIndex()) ?? '—');
    setText('[data-v="live"]', `Live · ${map} · ${env}`);
    $('[data-act="gfx"]').innerHTML = `Graphics · <b>${api.gfxName()}</b>`;
    $('[data-act="sound"]').innerHTML = `Detector · <b>${api.detector() ? 'On' : 'Off'}</b>`;
    $$('[data-gfx]').forEach((b) => b.classList.toggle('on', b.textContent === api.gfxName()));
    renderMaps();
    $$('.etile').forEach((b) => b.classList.toggle('on', +b.dataset.env === api.envIndex()));
    api.renderBoard(result?.at);
  }

  function renderState() {
    root.dataset.state = state;
    const kicker = $('.kicker'), play = $('.play span'), res = $('.result');
    const h = api.huntInfo();
    if (state === 'title') {
      kicker.textContent = 'A world that changes when you act.';
      play.textContent = 'Enter the game';
    } else if (state === 'pause') {
      kicker.innerHTML = '<b>●</b> Paused';
      play.textContent = 'Resume';
      res.innerHTML = `<div><small>Time</small><b>${h.time}</b></div><div><small>Loot</small><b>${h.found}/${h.total}</b></div>` +
        `<div><small>Destroyed</small><b>${h.destruction}%</b></div>`;
    } else {
      kicker.innerHTML = '<b>●</b> All loot found';
      play.textContent = 'Play again';
      const r = result;
      res.innerHTML = `<div><small>Your time</small><b>${r.time}</b>${r.rank === 1 ? '<em>New record</em>' : r.rank ? `<em>#${r.rank} on this map</em>` : '<em>Not in the top 10</em>'}</div>` +
        `<div><small>Points</small><b>${r.points}</b></div><div><small>Destroyed</small><b>${r.destruction}%</b></div>`;
    }
  }

  function show(st) {
    clearTimeout(hideTimer);
    state = st;
    renderState();
    sync();
    root.classList.remove('leaving', 'intro', 'enter', 'quake');
    root.style.display = '';
    document.body.classList.add('menu-open');
    void root.offsetWidth;
    root.classList.add(shown ? 'intro' : 'enter');
    shown = false;
    if (st === 'end') openPanel('records');
    else if (st === 'pause') openPanel(null);
  }

  function hide() {
    openPanel(null);
    root.classList.remove('intro', 'enter');
    root.classList.add('leaving');
    document.body.classList.remove('menu-open');
    slash.classList.remove('go');
    void slash.offsetWidth;
    slash.classList.add('go');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { root.style.display = 'none'; root.classList.remove('leaving'); }, 650);
  }

  // ---- events ----
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.panel) openPanel(panel === t.dataset.panel ? null : t.dataset.panel);
    else if (t.dataset.map) { if (+t.dataset.map !== api.mapIndex()) api.setMap(+t.dataset.map); }
    else if (t.dataset.env) api.setEnv(+t.dataset.env);
    else if (t.dataset.gfx) api.setGfx(+t.dataset.gfx);
    else if (t.dataset.act === 'play') api.play();
    else if (t.dataset.act === 'restart') api.restart();
    else if (t.dataset.act === 'close') openPanel(null);
    else if (t.dataset.act === 'gfx') api.setGfx(-1);
    else if (t.dataset.act === 'sound') api.toggleDetector();
    sync();
  });
  addEventListener('keydown', (e) => {
    if (root.style.display === 'none' || root.classList.contains('leaving')) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') api.play();
    if (e.code === 'Escape' && panel) openPanel(null);
  });

  renderEnvs();

  return {
    show, hide, sync,
    state: () => (root.style.display === 'none' || root.classList.contains('leaving') ? null : state),
    panelOpen: () => !!panel,
    setResult(r) { result = r; },
    quake() { root.classList.remove('quake'); void root.offsetWidth; root.classList.add('quake'); },
    fade(cb) {
      const f = $('.fader');
      f.classList.add('on');
      setTimeout(() => { cb(); setTimeout(() => f.classList.remove('on'), 60); }, 420);
    },
  };
}
