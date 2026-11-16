// hud.js — the DOM overlay: health, ammo, timer, score, money, buy menu,
// killfeed, banners and the plant/defuse bar. The sim never touches the
// DOM directly; it emits events and main.js routes them here.

import { weaponDef, WEAPONS, GRENADES, BUY_MENU } from './weapons.js';
import { TEAM_NAMES } from './state.js';

export function createHud(doc) {
  const el = {
    healthNum: doc.getElementById('health-num'),
    healthBar: doc.getElementById('health-bar'),
    healthFill: doc.getElementById('health-fill'),
    ammoMag: doc.getElementById('ammo-mag'),
    ammoReserve: doc.getElementById('ammo-reserve'),
    weaponName: doc.getElementById('weapon-name'),
    money: doc.getElementById('money'),
    timer: doc.getElementById('timer'),
    scoreV: doc.getElementById('score-v'),
    scoreJ: doc.getElementById('score-j'),
    roundLabel: doc.getElementById('round-label'),
    aliveV: doc.getElementById('alive-v'),
    aliveJ: doc.getElementById('alive-j'),
    killfeed: doc.getElementById('killfeed'),
    banner: doc.getElementById('banner'),
    bannerSub: doc.getElementById('banner-sub'),
    buyMenu: doc.getElementById('buy-menu'),
    buyItems: doc.getElementById('buy-items'),
    progress: doc.getElementById('progress'),
    progressFill: doc.getElementById('progress-fill'),
    progressLabel: doc.getElementById('progress-label'),
    hint: doc.getElementById('hint'),
    bombStatus: doc.getElementById('bomb-status'),
    damage: doc.getElementById('damage'),
    hitmarker: doc.getElementById('hitmarker'),
    crosshair: doc.getElementById('crosshair'),
    startScreen: doc.getElementById('start-screen'),
    matchScreen: doc.getElementById('match-screen'),
    matchTitle: doc.getElementById('match-title'),
    matchScore: doc.getElementById('match-score'),
  };

  // Build the buy menu once from the same data as the economy.
  const rows = [];
  for (const item of BUY_MENU) {
    const row = doc.createElement('div');
    row.className = 'buy-row';
    row.dataset.item = item.id;
    const def = WEAPONS[item.id] || GRENADES[item.id];
    row.innerHTML =
      '<span class="buy-key">[' + item.key + ']</span>' +
      '<span class="buy-name">' + item.label + '</span>' +
      '<span class="buy-price">$' + def.price + '</span>';
    el.buyItems.appendChild(row);
    rows.push({ row, id: item.id, price: def.price });
  }

  const cache = {};
  function setText(node, key, value) {
    if (!node || cache[key] === value) return;
    cache[key] = value;
    node.textContent = value;
  }
  function setWidth(node, key, pct) {
    if (!node) return;
    const v = Math.round(pct);
    if (cache[key] === v) return;
    cache[key] = v;
    node.style.width = v + '%';
  }

  let bannerT = 0;
  let hitT = 0;
  let dmgT = 0;

  const hud = {
    update(S, p, dt) {
      const def = weaponDef(p.weapon);
      setText(el.healthNum, 'hp', String(Math.max(0, Math.ceil(p.hp))));
      setWidth(el.healthFill, 'hpf', Math.max(0, p.hp));
      el.healthFill.style.background = p.hp > 50 ? '#7fd08a' : p.hp > 25 ? '#e8b93e' : '#ff7a6a';
      if (p.weapon === 'smoke' || p.weapon === 'frag') {
        setText(el.ammoMag, 'mag', 'x' + p.grenades[p.weapon]);
        setText(el.ammoReserve, 'res', '');
        setText(el.weaponName, 'wname', GRENADES[p.weapon].name);
      } else {
        setText(el.ammoMag, 'mag', String(p.mag));
        setText(el.ammoReserve, 'res', '/ ' + p.reserve);
        setText(el.weaponName, 'wname', def.name + (p.reloading ? ' — reloading' : ''));
      }
      setText(el.money, 'money', '$' + p.money);
      const t = Math.max(0, Math.ceil(S.phaseT));
      const mm = Math.floor(t / 60);
      const ss = String(t % 60).padStart(2, '0');
      setText(el.timer, 'timer', mm + ':' + ss);
      setText(el.scoreV, 'sv', String(S.score.V));
      setText(el.scoreJ, 'sj', String(S.score.J));
      setText(el.roundLabel, 'round', 'ROUND ' + S.round + ' / ' + Math.max(S.round, 9));
      const vAlive = S.agents.filter((a) => a.team === 'V' && a.alive).length;
      const jAlive = S.agents.filter((a) => a.team === 'J' && a.alive).length;
      setText(el.aliveV, 'av', 'V ' + vAlive + ' alive');
      setText(el.aliveJ, 'aj', 'J ' + jAlive + ' alive');

      // Bomb status line.
      let bombText = '';
      if (S.bomb.state === 'planted') bombText = 'BOMB PLANTED — Site ' + S.bomb.site + ' — ' + Math.ceil(S.bomb.timer) + 's';
      else if (S.bomb.state === 'dropped') bombText = 'BOMB DROPPED';
      else if (S.bomb.state === 'carried') bombText = 'Bomb with ' + (S.agents[S.bomb.carrier] || {}).name;
      setText(el.bombStatus, 'bomb', bombText);

      // Plant / defuse progress bar.
      let prog = -1;
      let progLabel = '';
      if (p.planting) {
        prog = p.plantT / 3.5;
        progLabel = 'PLANTING…';
      } else if (p.defusing) {
        prog = p.defuseT / 5;
        progLabel = 'DEFUSING…';
      } else {
        for (const a of S.agents) {
          if (a.bot && a.alive && a.planting) {
            prog = a.plantT / 3.5;
            progLabel = a.name + ' is planting…';
            break;
          }
          if (a.bot && a.alive && a.defusing) {
            prog = a.defuseT / 5;
            progLabel = a.name + ' is defusing…';
            break;
          }
        }
      }
      if (prog >= 0) {
        el.progress.style.display = 'block';
        setWidth(el.progressFill, 'prog', prog * 100);
        setText(el.progressLabel, 'progL', progLabel);
      } else if (el.progress.style.display !== 'none') {
        el.progress.style.display = 'none';
      }

      // Buy menu affordability.
      if (S.phase === 'buy') {
        el.buyMenu.style.display = 'block';
        for (const r of rows) {
          const afford = p.money >= r.price;
          const owned = r.id === p.primary;
          r.row.classList.toggle('cant', !afford && !owned);
          r.row.classList.toggle('owned', !!owned);
        }
      } else if (el.buyMenu.style.display !== 'none') {
        el.buyMenu.style.display = 'none';
      }

      // Timed overlays.
      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) {
          el.banner.style.display = 'none';
          el.bannerSub.style.display = 'none';
        }
      }
      if (hitT > 0) {
        hitT -= dt;
        el.hitmarker.style.opacity = hitT > 0 ? '1' : '0';
      }
      if (dmgT > 0) {
        dmgT -= dt;
        el.damage.style.opacity = String(Math.max(0, dmgT * 1.5));
      }
      // Crosshair spread grows with bloom and movement.
      const spread = 6 + p.bloom * 220 + (p.moving ? 6 : 0);
      el.crosshair.style.setProperty('--gap', spread.toFixed(1) + 'px');
    },

    killfeed(text, cls) {
      const div = doc.createElement('div');
      div.className = 'kf ' + (cls || '');
      div.textContent = text;
      el.killfeed.prepend(div);
      while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
      setTimeout(() => {
        if (div.parentNode) div.parentNode.removeChild(div);
      }, 6000);
    },

    banner(text, sub, dur) {
      el.banner.textContent = text;
      el.bannerSub.textContent = sub || '';
      el.banner.style.display = 'block';
      el.bannerSub.style.display = 'block';
      bannerT = dur || 3;
    },

    setHint(text) {
      setText(el.hint, 'hint', text);
    },

    hitmarker(head) {
      el.hitmarker.style.color = head ? '#ff5a4a' : '#ffffff';
      hitT = 0.18;
    },

    damageFlash() {
      dmgT = 0.6;
    },

    showStart() {
      el.startScreen.style.display = 'flex';
    },
    hideStart() {
      el.startScreen.style.display = 'none';
    },
    showMatch(winner, scoreV, scoreJ) {
      const name = winner ? TEAM_NAMES[winner] : 'Draw';
      el.matchTitle.textContent = winner ? name + ' win the match' : 'Match drawn';
      el.matchScore.textContent = 'Vanguard ' + scoreV + ' — ' + scoreJ + ' Jackals';
      el.matchScreen.style.display = 'flex';
    },
    hideMatch() {
      el.matchScreen.style.display = 'none';
    },
  };
  return hud;
}
