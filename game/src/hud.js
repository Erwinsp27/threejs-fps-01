// DUSTLINE — the HUD: every DOM readout, the buy menu and the banners. The sim
// never touches the DOM directly; it calls these methods and this module writes
// textContent / styles. HUD writes are cheap: only changed values are written.
export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const cache = {};
  function set(id, text) {
    if (cache[id] !== text) { cache[id] = text; const n = el(id); if (n) n.textContent = text; }
  }

  return {
    setHealth(hp) {
      set('hp-num', String(Math.max(0, Math.ceil(hp))));
      const bar = el('hp-bar');
      if (bar) bar.style.width = `${Math.max(0, hp)}%`;
      const wrap = el('hp');
      if (wrap) wrap.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, reloading) {
      set('ammo-mag', reloading ? '--' : String(mag));
      set('ammo-res', String(reserve));
      const w = el('ammo');
      if (w) w.classList.toggle('reloading', reloading);
    },
    setWeapon(name) { set('weapon-name', name); },
    setMoney(m) { set('money', `$${m}`); },
    setTimer(sec) {
      const s = Math.max(0, Math.ceil(sec));
      set('timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    },
    setScore(v, j, round) {
      set('score-v', String(v));
      set('score-j', String(j));
      set('round-num', `ROUND ${round}`);
    },
    setBomb(text) { set('bomb-status', text); },
    setSpread(px) {
      const c = el('crosshair');
      if (c) c.style.setProperty('--gap', `${px}px`);
    },
    hitmarker(head) {
      const h = el('hitmarker');
      if (!h) return;
      h.classList.add('on');
      h.classList.toggle('head', !!head);
      clearTimeout(h._t);
      h._t = setTimeout(() => h.classList.remove('on'), 110);
    },
    damageFlash() {
      const d = el('damage');
      if (!d) return;
      d.classList.add('on');
      clearTimeout(d._t);
      d._t = setTimeout(() => d.classList.remove('on'), 180);
    },
    announce(title, sub) {
      set('announce-title', title);
      set('announce-sub', sub || '');
      const a = el('announce');
      if (a) { a.classList.add('on'); clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove('on'), 3200); }
    },
    showBanner(title, sub) {
      set('banner-title', title);
      set('banner-sub', sub || '');
      const b = el('banner');
      if (b) { b.classList.add('on'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('on'), 3600); }
    },
    showDeath(killer) {
      set('death-killer', killer ? `Eliminated by ${killer}` : 'Eliminated');
      const d = el('death');
      if (d) d.classList.add('on');
    },
    hideDeath() { const d = el('death'); if (d) d.classList.remove('on'); },
    showBuy(open) {
      const b = el('buy');
      if (b) b.classList.toggle('on', !!open);
    },
    setBuyMoney(m) { set('buy-money', `$${m}`); },
    refreshKillfeed(feed) {
      const k = el('killfeed');
      if (!k) return;
      const html = feed.map(f => `<div>${f.text}</div>`).join('');
      if (cache.killfeed !== html) { cache.killfeed = html; k.innerHTML = html; }
    },
    setPhase(text) { set('phase', text); },
    showStart(show) { const s = el('start'); if (s) s.classList.toggle('on', !!show); },
    showMatch(winner, score) {
      set('match-title', winner === 'vanguard' ? 'VANGUARD WINS THE MATCH' : 'JACKALS WIN THE MATCH');
      set('match-score', `${score.vanguard} — ${score.jackals}`);
      const m = el('match');
      if (m) m.classList.add('on');
    },
    hideMatch() { const m = el('match'); if (m) m.classList.remove('on'); },
  };
}
