  import type { Difficulty, GameState, Move, RollResult, Side } from '../types';
  import { newGameState, legalMoves, applyMove, piecesHome, piecesOnBoard, otherSide, SHARED_MAX } from '../game/rules';
  import { rollDayam } from '../game/dice';
  import { loopCellIndex, SAFE_CELLS } from '../game/board';
  import { chooseMove } from '../ai/expectimax';
  import { Audio2 } from '../audio/sounds';
  import { Scene3D } from '../three/scene';

  export class UIController {
    private state: GameState | null = null;
    private difficulty: Difficulty = 'medium';
    private debugOn = false;
    private scene: Scene3D;

    constructor(scene: Scene3D) {
      this.scene = scene;
    }

    private el<T extends HTMLElement = HTMLElement>(id: string): T {
      const found = document.getElementById(id);
      if (!found) throw new Error(`missing #${id}`);
      return found as T;
    }

    private toastTimer: ReturnType<typeof setTimeout> | undefined;
    private toast(msg: string, dur = 1600) {
      const t = this.el('msgToast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.remove('show'), dur);
    }

    openModal(id: string) { this.el(id).classList.remove('hidden'); }
    closeModal(id: string) { this.el(id).classList.add('hidden'); }

    private refreshStatus() {
      const state = this.state!;
      this.el('pHome').textContent = String(piecesHome(state, 'player'));
      this.el('pBoard').textContent = String(piecesOnBoard(state, 'player'));
      this.el('aHome').textContent = String(piecesHome(state, 'ai'));
      this.el('aBoard').textContent = String(piecesOnBoard(state, 'ai'));
      const tv = this.el('turnValue');
      if (state.turn === 'player') { tv.textContent = 'Your Turn'; tv.className = 'value player'; }
      else { tv.textContent = 'AI Turn'; tv.className = 'value ai'; }
    }

    startGame() {
      this.state = newGameState();
      this.scene.layoutPieces(this.state, false);
      this.refreshStatus();
      this.el('diceResult').innerHTML = 'Roll the Dayam to begin';
      this.el('pieceChoices').innerHTML = '';
      (this.el('rollBtn') as HTMLButtonElement).disabled = false;
      this.scene.setSelectable([]);
      this.el('hud').classList.remove('hidden');
      this.el('screen-menu').classList.add('hidden');
      this.el('screen-end').classList.add('hidden');
    }

    private endTurnCheck(extra: boolean) {
      const state = this.state!;
      if (state.over) { this.showEnd(); return; }
      if (extra) {
        this.el('diceResult').innerHTML = 'Special throw — roll again!';
        this.el('pieceChoices').innerHTML = '';
        this.scene.setSelectable([]);
        (this.el('rollBtn') as HTMLButtonElement).disabled = state.turn !== 'player';
        if (state.turn === 'ai') setTimeout(() => this.aiTurn(), 700);
        return;
      }
      state.turn = otherSide(state.turn);
      this.refreshStatus();
      this.el('pieceChoices').innerHTML = '';
      this.scene.setSelectable([]);
      if (state.turn === 'player') {
        this.el('diceResult').innerHTML = 'Your turn — roll the Dayam';
        (this.el('rollBtn') as HTMLButtonElement).disabled = false;
      } else {
        this.el('diceResult').innerHTML = "AI's turn";
        (this.el('rollBtn') as HTMLButtonElement).disabled = true;
        setTimeout(() => this.aiTurn(), 700);
      }
    }

    doRoll(forcedRoll?: RollResult) {
      const state = this.state!;
      if (state.over) return;
      (this.el('rollBtn') as HTMLButtonElement).disabled = true;
      Audio2.diceThrow();
      const result = forcedRoll || rollDayam();
      state.stats[state.turn].turns++;
      if (result.extra) state.stats[state.turn].special++;
      this.scene.animateDiceRoll(result, () => {
        Audio2.diceSettle();
        this.onRollResolved(result);
      });
    }

    private onRollResolved(result: RollResult) {
      const state = this.state!;
      this.el('diceResult').innerHTML = `You rolled <b>${result.score}</b>${result.extra ? ' — special!' : ''}`;
      if (state.turn === 'playe') {
        const moves = legalMoves(state, 'player', result.score);
        if (moves.length === 0) {
          this.toast(
  `No piece can move ${result.score} spaces — your turn passes`,
  2200
);
          setTimeout(() => this.endTurnCheck(false), 900);
          return;
        }
        this.showPlayerChoices(moves, result);
      }
    }

    private showPlayerChoices(moves: Move[], result: RollResult) {
      const wrap = this.el('pieceChoices');
      wrap.innerHTML = '';
      this.scene.setSelectable(moves.map(m => ({ side: 'player' as Side, index: m.pieceIndex })));
      for (let i = 0; i < 4; i++) {
        const mv = moves.find(m => m.pieceIndex === i);
        const btn = document.createElement('div');
        btn.className = 'piece-choice' + (mv ? '' : ' disabled');
        btn.textContent = `Piece ${i + 1}` + (mv && mv.kind === 'enter' ? ' (enter)' : '') + (mv && mv.capture !== null ? ' ⚔' : '') + (mv && mv.willFinish ? ' 🏠' : '');
        if (mv) btn.onclick = () => this.commitPlayerMove(mv, result);
        wrap.appendChild(btn);
      }
      this.scene.setOnPieceClick((side, index) => {
        if (side !== 'player') return;
        const mv = moves.find(m => m.pieceIndex === index);
        if (mv) this.commitPlayerMove(mv, result);
      });
    }

    private commitPlayerMove(mv: Move, result: RollResult) {
      const state = this.state!;
      this.scene.markSelected('player', mv.pieceIndex);
      const res = applyMove(state, 'player', mv);
      Audio2.move();
      this.scene.layoutPieces(state, true);
      setTimeout(() => {
        if (res.capturedSide) { this.toast('Piece captured!'); Audio2.capture(); }
        else if (res.finished) { this.toast('Piece home!'); Audio2.home(); }
        else if (mv.newProgress <= SHARED_MAX && SAFE_CELLS.has(loopCellIndex('player', mv.newProgress))) { Audio2.safe(); }
        if (result.extra) Audio2.special();
        this.refreshStatus();
        this.el('pieceChoices').innerHTML = '';
        this.scene.setSelectable([]);
        this.endTurnCheck(result.extra && !state.over);
      }, 380);
    }

    private aiTurn() {
      const state = this.state!;
      if (state.over) return;
      this.el('aiThinking').classList.add('show');
      Audio2.diceThrow();
      const result = rollDayam();
      state.stats.ai.turns++;
      if (result.extra) state.stats.ai.special++;
      this.scene.animateDiceRoll(result, () => {
        Audio2.diceSettle();
        this.el('diceResult').innerHTML = `AI rolled <b>${result.score}</b>${result.extra ? ' — special!' : ''}`;
        setTimeout(() => {
          const mv = chooseMove(state, result.score, this.difficulty, 'ai');
          this.el('aiThinking').classList.remove('show');
          if (!mv) {
            this.toast('AI has no legal move');
            setTimeout(() => this.endTurnCheck(false), 700);
            return;
          }
          this.scene.markSelected('ai', mv.pieceIndex);
          const res = applyMove(state, 'ai', mv);
          Audio2.move();
          this.scene.layoutPieces(state, true);
          setTimeout(() => {
            if (res.capturedSide) { this.toast('AI captured your piece!'); Audio2.capture(); }
            else if (res.finished) { this.toast('AI piece home'); Audio2.home(); }
            if (result.extra) Audio2.special();
            this.refreshStatus();
            this.endTurnCheck(result.extra && !state.over);
          }, 380);
        }, 500);
      });
    }

    restartGame() {
  if (!this.state) {
    this.startGame();
    return;
  }

  const confirmed = window.confirm(
    'Restart the current game? Your current progress will be lost.'
  );

  if (!confirmed) return;

  this.startGame();
  this.toast('New game started');
}

    private showEnd() {
      const state = this.state!;
      this.el('hud').classList.add('hidden');
      const scr = this.el('screen-end');
      scr.classList.remove('hidden');
      const won = state.winner === 'player';
      this.el('endTitle').textContent = won ? 'YOU WIN' : 'AI WINS';
      this.el('endSub').textContent = won ? 'All four pieces home' : 'The AI brought its pieces home first';
      this.el('stPHome').textContent = String(piecesHome(state, 'player'));
      this.el('stPCaps').textContent = String(state.stats.player.captures);
      this.el('stPTurns').textContent = String(state.stats.player.turns);
      this.el('stPSpecial').textContent = String(state.stats.player.special);
      this.el('stPDist').textContent = String(state.stats.player.distance);
      this.el('stPSafe').textContent = String(state.stats.player.longestSafeStreak);
      this.el('stAHome').textContent = String(piecesHome(state, 'ai'));
      this.el('stACaps').textContent = String(state.stats.ai.captures);
      this.el('stATurns').textContent = String(state.stats.ai.turns);
      const secs = Math.floor((Date.now() - state.startTime) / 1000);
      this.el('stDuration').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      if (won) Audio2.victory(); else Audio2.defeat();
    }

    private buildDifficultyRow() {
      const row = this.el('diffRow');
      const opts: [Difficulty, string, string][] = [
  ['easy', 'Easy', 'Best for learning the game'],
  ['medium', 'Medium', 'A balanced challenge'],
  ['hard', 'Hard', 'Plans stronger tactical moves'],
  ['expert', 'Expert', 'Maximum strategic challenge']
];
      row.innerHTML = '';
      opts.forEach(([key, label]) => {
        const pill = document.createElement('div');
        pill.className = 'diff-pill' + (key === this.difficulty ? ' active' : '');
        pill.textContent = label;
        pill.onclick = () => { this.difficulty = key; this.buildDifficultyRow(); };
        row.appendChild(pill);
      });
    }

    private updateDebug() {
      if (!this.debugOn) return;
      let panel = document.getElementById('debugPanel');
      if (panel && this.state) {
        panel.textContent = JSON.stringify(
          { turn: this.state.turn, pieces: this.state.pieces, over: this.state.over, winner: this.state.winner },
          null, 2
        );
      }
      setTimeout(() => this.updateDebug(), 500);
    }

    wire() {
      this.el('playBtn').onclick = () => this.startGame();
      this.el('restartBtn').onclick = () => this.restartGame();
      this.el('playAgainBtn').onclick = () => {
        this.el('screen-menu').classList.remove('hidden');
        this.el('screen-end').classList.add('hidden');
      };
      this.el('rollBtn').onclick = () => this.doRoll();
      this.el('rulesBtn').onclick = () => this.openModal('modal-rules');
      this.el('rulesBtnMenu').onclick = () => this.openModal('modal-rules');
      this.el('aboutBtnMenu').onclick = () => this.openModal('modal-about');
      this.el('fairBtnMenu').onclick = () => this.openModal('modal-fair');
      this.el('resetCamBtn').onclick = () => this.scene.resetCamera();
      this.el('menuBtn').onclick = () => {
        this.el('hud').classList.add('hidden');
        this.el('screen-menu').classList.remove('hidden');
      };
      this.el('muteBtn').onclick = (e) => {
        const target = e.target as HTMLElement;
        const muted = target.textContent === '🔊';
        Audio2.setMuted(muted);
        target.textContent = muted ? '🔇' : '🔊';
      };
      document.addEventListener('keydown', (e) => {
        if (e.key === 'd' && e.ctrlKey) {
          this.debugOn = !this.debugOn;
          let panel = document.getElementById('debugPanel');
          if (!panel) {
            panel = document.createElement('div');
            panel.id = 'debugPanel';
            document.body.appendChild(panel);
          }
          panel.style.display = this.debugOn ? 'block' : 'none';
          if (this.debugOn) this.updateDebug();
        }
      });
      document.querySelectorAll<HTMLElement>('[data-close-modal]').forEach(btn => {
        btn.onclick = () => this.closeModal(btn.dataset.closeModal!);
      });
      this.buildDifficultyRow();
    }

    private saveGameStats() {
  if (!this.state) return;

  const history = JSON.parse(
    localStorage.getItem('dayakattam-history') || '[]'
  );

  history.push({
    winner: this.state.winner,
    playedAt: new Date().toISOString(),
    player: this.state.stats.player,
    ai: this.state.stats.ai,
    duration: Date.now() - this.state.startTime
  });

  localStorage.setItem(
    'dayakattam-history',
    JSON.stringify(history.slice(-20))
  );
}


  }
