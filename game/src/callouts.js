// Radio callouts: the team's voice. Bots announce the round plan, enemies
// they spot, the bomb going down and teammates going down, and the lines land
// in the HUD radio feed — so the player can play with the team instead of
// guessing where it went. One global throttle keeps the feed readable.
import { SITES } from './world.js';

export function createRadio(state, hud) {
  let lastAt = -99;

  function say(name, team, text, time) {
    if (time - lastAt < 1.5) return;
    lastAt = time;
    state.radio.push({ name, team, text, time });
    if (state.radio.length > 6) state.radio.shift();
    if (hud) hud.addRadio(name, team, text);
  }

  function laneName(lane) {
    return lane === 'mid' ? 'mid' : lane === 'west' ? 'west yard' : lane === 'east' ? 'east yard' : 'walkway';
  }

  return {
    say,
    plan(site, lanes, time) {
      const label = SITES[site].label;
      say('HALO', 'atk', `Plan: push ${site} ${label} — ${lanes.map(laneName).join(', ')}.`, time);
    },
    spotted(bot, enemy, time) {
      const where = enemy.position.z < -8 ? 'north' : enemy.position.z > 8 ? 'south' : 'mid';
      const who = enemy.kind === 'player' ? 'one attacker' : enemy.name;
      say(bot.name, bot.team, `Contact ${where} — ${who}.`, time);
    },
    planted(site, time) {
      say('HALO', 'atk', `Bomb down at ${site}. Hold the crossfires.`, time);
    },
    defusing(bot, time) {
      say(bot.name, bot.team, `Defusing — cover me.`, time);
    },
    down(name, team, time) {
      say('HALO', team, `${name} is down.`, time);
    },
    dropped(time) {
      say('HALO', 'atk', `Bomb dropped — pick it up.`, time);
    },
  };
}
