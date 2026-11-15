// Rounds: buy -> live -> end, then the next round, until one team takes five.
// The timer only ends a round while the bomb is not planted; once planted, the
// fuse decides. Elimination, explosion and defusal end rounds through endRound,
// called by main.js when the sim reports them.
export function createRounds(state, hooks) {
  function setPhase(phase, seconds) {
    state.phase = phase;
    state.phaseTime = 0;
    state.timeLeft = seconds;
  }

  function startRound() {
    state.roundWinner = null;
    state.roundReason = '';
    setPhase('buy', state.buySeconds);
    if (hooks.onBuyPhase) hooks.onBuyPhase(state.round);
  }

  function goLive() {
    setPhase('live', state.roundSeconds);
    if (hooks.onLive) hooks.onLive(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.score[winner] += 1;
    state.roundWinner = winner;
    state.roundReason = reason;
    if (hooks.onRoundEnd) hooks.onRoundEnd(winner, reason, state.round);
    if (state.score[winner] >= state.winsToTakeMatch) {
      setPhase('match', 0);
      if (hooks.onMatchEnd) hooks.onMatchEnd(winner);
      return;
    }
    setPhase('end', state.endSeconds);
  }

  function update(dt) {
    state.phaseTime += dt;
    if (state.phase === 'buy') {
      state.timeLeft = Math.max(0, state.buySeconds - state.phaseTime);
      if (state.phaseTime >= state.buySeconds) goLive();
      return;
    }
    if (state.phase === 'live') {
      // The clock stops mattering once the bomb is planted: the fuse rules.
      if (state.bomb.status !== 'planted') {
        state.timeLeft = Math.max(0, state.roundSeconds - state.phaseTime);
        if (state.phaseTime >= state.roundSeconds) {
          endRound('def', 'Time expired — the bomb was never planted');
        }
      } else {
        state.timeLeft = state.bomb.explodeLeft;
      }
      return;
    }
    if (state.phase === 'end') {
      state.timeLeft = Math.max(0, state.endSeconds - state.phaseTime);
      if (state.phaseTime >= state.endSeconds) {
        state.round += 1;
        startRound();
      }
    }
  }

  return { startRound, goLive, endRound, update, setPhase };
}
