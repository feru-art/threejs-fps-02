// The one place state lives. Every module reads or writes its slice of this
// object; nothing else keeps a copy of round, score, money or bomb state.
export function createState() {
  return {
    // Match and round: phase 'buy' | 'live' | 'end' | 'match'.
    phase: 'buy',
    round: 1,
    winsToTakeMatch: 5,
    score: { atk: 0, def: 0 },
    phaseTime: 0,
    buySeconds: 12,
    roundSeconds: 100,
    endSeconds: 4,
    timeLeft: 12,
    roundWinner: null,
    roundReason: '',
    // Economy: one wallet per combatant id.
    money: {},
    // Bomb: 'carried' | 'dropped' | 'planted' | 'gone'.
    bomb: { status: 'carried', carrier: null, site: null, x: 0, z: 0, plantLeft: 0, defuseLeft: 0, explodeLeft: 0, plantDone: false, defuseDone: false },
    // Combatants, filled by main.js: the player plus nine bots.
    entities: [],
    // Radio callouts and minimap pings, newest last.
    radio: [],
    pings: [],
    kills: { player: 0, atk: 0, def: 0 },
    // The round plan, announced at buy phase: { site, lanes }.
    plan: null,
    muted: false,
    started: false,
    elapsed: 0,
  };
}
