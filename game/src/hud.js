// The DOM HUD: crosshair with a spread gap, hit marker, health, armour,
// ammo, money, timer, score, kill feed, radio callouts, prompts, the buy
// menu and the overlays. It never touches the simulation; main.js pushes
// numbers in and reads callbacks out. Every setter skips work when the value
// did not change.
const COPY = {
  start: {
    title: 'NORTHLIGHT <span>RELAY</span>',
    copy: 'A 5v5 tactical shooter at an Arctic relay station under the aurora. You attack with four bots against five defenders: plant the bomb at site A or B, or eliminate the other team. Earn money each round and spend it in the buy menu — rifles, armour, frag and smoke grenades. Stop to aim — firing on the move punishes you, and right mouse aims down sights.',
    action: 'Click to play',
  },
  paused: {
    title: 'NORTHLIGHT <span>RELAY</span>',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const timer = $('timer');
  const roundLabel = $('round-label');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const healthValue = $('health-value');
  const healthFill = $('health-fill');
  const armourRow = $('armour-row');
  const armourValue = $('armour-value');
  const armourFill = $('armour-fill');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const weaponName = $('weapon-name');
  const money = $('money');
  const grenades = $('grenades');
  const killfeed = $('killfeed');
  const radioFeed = $('radio');
  const prompt = $('prompt');
  const bombstatus = $('bombstatus');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const damage = $('damage');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const buy = $('buy');
  const buyCash = $('buy-cash');
  const buyItems = [...buy.querySelectorAll('.item')];
  let last = {};
  let hitTimer = 0;
  let damageTimer = 0;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setTimer(seconds, low) {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      setText(timer, 'timer', `${m}:${String(s).padStart(2, '0')}`);
      timer.classList.toggle('low', !!low);
    },
    setScore(atk, def) {
      setText(scoreAtk, 'atk', String(atk));
      setText(scoreDef, 'def', String(def));
    },
    setRoundLabel(text) {
      setText(roundLabel, 'round', text);
    },
    setHealth(value) {
      setText(healthValue, 'hp', String(Math.max(0, Math.ceil(value))));
      const pct = `${Math.max(0, Math.min(100, value))}%`;
      if (last.hpbar !== pct) {
        last.hpbar = pct;
        healthFill.style.width = pct;
      }
      healthFill.classList.toggle('low', value <= 30);
    },
    setArmour(value) {
      const v = Math.max(0, Math.ceil(value));
      setText(armourValue, 'arm', String(v));
      armourRow.hidden = v <= 0;
      const pct = `${Math.max(0, Math.min(100, value))}%`;
      if (last.armbar !== pct) {
        last.armbar = pct;
        armourFill.style.width = pct;
      }
    },
    setAmmo(mag, reserve, weapon) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wpn', weapon);
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(money, 'money', `$${value}`);
      setText(buyCash, 'buycash', `$${value}`);
      for (const item of buyItems) {
        const price = Number(item.lastElementChild.textContent.replace(/[^0-9]/g, ''));
        item.classList.toggle('cant', value < price);
      }
    },
    setGrenades(frag, smoke) {
      const parts = [];
      if (frag > 0) parts.push(`◉ ${frag} frag [G]`);
      if (smoke > 0) parts.push(`◎ ${smoke} smoke [H]`);
      setText(grenades, 'gren', parts.join('  '));
    },
    setCrosshairGap(px, aiming) {
      const v = `${Math.round(px)}px`;
      if (last.gap !== v) {
        last.gap = v;
        crosshair.style.setProperty('--gap', v);
      }
      crosshair.classList.toggle('ads', !!aiming);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      damage.style.opacity = '1';
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => {
        damage.style.opacity = '0';
      }, 180);
    },
    addFeed(html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      killfeed.appendChild(div);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.firstChild);
      setTimeout(() => {
        if (div.parentNode) div.parentNode.removeChild(div);
      }, 6000);
    },
    addRadio(name, team, text) {
      const div = document.createElement('div');
      const cls = team === 'atk' ? 'a' : 'd';
      div.innerHTML = `<span class="${cls}">${name}</span> ▸ ${text}`;
      radioFeed.appendChild(div);
      while (radioFeed.children.length > 4) radioFeed.removeChild(radioFeed.firstChild);
      setTimeout(() => {
        if (div.parentNode) div.parentNode.removeChild(div);
      }, 8000);
    },
    setPrompt(text) {
      if (!text) {
        prompt.hidden = true;
        return;
      }
      if (last.prompt !== text) {
        last.prompt = text;
        prompt.textContent = text;
      }
      prompt.hidden = false;
    },
    setBombStatus(text) {
      if (!text) {
        bombstatus.hidden = true;
        return;
      }
      if (last.bomb !== text) {
        last.bomb = text;
        bombstatus.textContent = text;
      }
      bombstatus.hidden = false;
    },
    showBanner(titleText, subText) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText || '';
      banner.hidden = false;
    },
    hideBanner() {
      banner.hidden = true;
    },
    showBuy(open) {
      buy.hidden = !open;
    },
    isBuyOpen() {
      return !buy.hidden;
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.innerHTML = text.title;
      copy.textContent = mode === 'match' && extra ? extra : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
