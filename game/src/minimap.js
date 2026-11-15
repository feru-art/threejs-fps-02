// The minimap: a small top-down canvas in the HUD. It always shows the
// player, living teammates and both sites — and enemies only as fading
// last-known pings, dropped when a bot spots one, hears a shot, or when the
// bomb is planted. It never shows live enemy positions: that would be a
// wallhack, and it would make scouting pointless.
import { SITES } from './world.js';

const MAP_W = 64;
const MAP_H = 44;

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const sx = W / MAP_W;
  const sz = H / MAP_H;

  function toX(x) {
    return (x + MAP_W / 2) * sx;
  }
  function toY(z) {
    return (z + MAP_H / 2) * sz;
  }

  function draw(state, player, bots) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(13,21,32,0.82)';
    ctx.fillRect(0, 0, W, H);
    // Snow field.
    ctx.fillStyle = '#c8d3de';
    ctx.fillRect(2, 2, W - 4, H - 4);
    // Walkway.
    ctx.fillStyle = '#39424c';
    ctx.fillRect(toX(-2), toY(-19), 4 * sx, 38 * sz);
    // Sites.
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const key of ['A', 'B']) {
      const site = SITES[key];
      ctx.fillStyle = state.bomb.status === 'planted' && state.bomb.site === key ? '#ff5544' : '#d98a2b';
      ctx.beginPath();
      ctx.arc(toX(site.x), toY(site.z), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d1520';
      ctx.fillText(key, toX(site.x), toY(site.z));
    }
    // Enemy pings: last-known positions, fading over 4 seconds.
    for (const ping of state.pings) {
      const age = state.elapsed - ping.time;
      if (age > 4) continue;
      ctx.globalAlpha = 1 - age / 4;
      ctx.fillStyle = ping.team === 'atk' ? '#ff9a3c' : '#4cc3ff';
      ctx.beginPath();
      ctx.arc(toX(ping.x), toY(ping.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Teammates (attackers orange, defenders blue) and the player (white ring).
    for (const bot of bots.list) {
      if (!bot.alive) continue;
      ctx.fillStyle = bot.team === 'atk' ? '#ff9a3c' : '#4cc3ff';
      ctx.beginPath();
      ctx.arc(toX(bot.position.x), toY(bot.position.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (player.alive) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(toX(player.position.x), toY(player.position.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0d1520';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // The bomb carrier, when it is a teammate.
    if (state.bomb.status === 'carried' && state.bomb.carrier) {
      const carrier = [player, ...bots.list].find((e) => e.id === state.bomb.carrier);
      if (carrier) {
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(toX(carrier.position.x), toY(carrier.position.z), 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Frame.
    ctx.strokeStyle = '#2a3644';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  return { draw };
}
