// Money: every combatant has a wallet in state.money. A kill pays $300, a round
// win pays the whole team $3,250, a loss $1,900. Weapons persist across rounds
// (a bought rifle stays bought); grenades and ammo do not.
import { WEAPONS, GRENADE_PRICE, AMMO_PRICE } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_BONUS = 3250;
export const LOSS_BONUS = 1900;
export const MAX_MONEY = 16000;

export function createEconomy(state) {
  function get(id) {
    return state.money[id] ?? START_MONEY;
  }
  function set(id, value) {
    state.money[id] = Math.max(0, Math.min(MAX_MONEY, value));
  }

  return {
    get,
    set,
    awardKill(killerId) {
      if (killerId) set(killerId, get(killerId) + KILL_REWARD);
    },
    awardRound(winnerTeam, entities) {
      for (const entity of entities) {
        set(entity.id, get(entity.id) + (entity.team === winnerTeam ? WIN_BONUS : LOSS_BONUS));
      }
    },
    // Buy an item for an entity. Returns { ok, reason }. The caller applies the
    // item (equip a weapon, add a grenade, refill ammo) when ok is true.
    buy(id, item) {
      const price = item === 'grenade' ? GRENADE_PRICE : item === 'ammo' ? AMMO_PRICE : WEAPONS[item] ? WEAPONS[item].price : 0;
      if (get(id) < price) return { ok: false, reason: 'Not enough money' };
      set(id, get(id) - price);
      return { ok: true, reason: '' };
    },
    // Bots buy simply: rifle when rich, SMG when middling, pistol otherwise,
    // plus a grenade when flush. Called once per round in the buy phase.
    botBuy(bot, round) {
      const money = get(bot.id);
      if (round > 1 && money >= WEAPONS.rifle.price) return 'rifle';
      if (round > 1 && money >= WEAPONS.smg.price) return 'smg';
      return 'pistol';
    },
  };
}
