# Dayakattam — The Forgotten Game of Tamil Nadu

A playable, single-player 3D recreation of Dayakattam (Human vs AI), built
with Vite, TypeScript and Three.js.

This is a multi-file rewrite of an original single-HTML-file prototype.
Every module below is a straight, tested port of that prototype's logic —
nothing about the rules or the AI changed in the split, only the file
layout.

## 1. How to install

```bash
npm install
```

## 2. How to run

```bash
npm run dev        # local dev server with hot reload
npm run build       # type-checks, then produces a production build in dist/
npm run preview     # serves the production build locally
npm test            # runs the test suite once (vitest)
npm run test:watch  # runs the test suite in watch mode
```

Open the dev server URL printed in your terminal (usually
`http://localhost:5173`).

## 3. Architecture

```
src/
  types/         shared TypeScript interfaces (GameState, Move, RollResult, ...)
  game/
    board.ts     the 56-cell shared loop, safe cells, per-side layout, coordinate math
    dice.ts      cryptographic RNG + the Dayam roll table
    rules.ts     pure rules engine: legal moves, applying a move, win detection
  ai/
    expectimax.ts  the AI opponent (expectimax search + heuristic evaluation)
  audio/
    sounds.ts    procedural WebAudio sound effects (no external audio files)
  three/
    scene.ts     all Three.js rendering: board, pieces, dice, camera, input
  ui/
    controller.ts  DOM glue: wires buttons/modals to the engine, scene and AI
  main.ts        entry point, boots the scene and the UI controller
  style.css      all styling
index.html        page shell + markup for the menu, HUD and modals
tests/           vitest test suite for the engine, board topology and AI
```

The rules engine (`src/game/`) has **no dependency on rendering** — it's
plain TypeScript, fully unit-testable, and is exactly what the AI searches
over. `src/three/scene.ts` only reads game state and draws it; it never
decides what's legal.

## 4. Game rules

This implements **one documented playable Tamil Nadu rule set**, not every
regional variant of Dayakattam/Thaayam:

- A cross-shaped 56-cell track is shared by both sides.
- Each side has 4 pieces, starting at base (off the track).
- A piece can only leave base on a **special throw** (rolling a 4 or a 6),
  entering directly onto that side's start cell.
- On any other turn, you move a piece already on the board forward by the
  exact number rolled — you must land exactly on a cell; overshooting past
  home is not a legal move.
- Landing exactly on an opponent's piece on an unprotected cell sends it
  back to their base. Cells marked with a small diamond are safe — no
  capturing there.
- After a full circuit of the shared track, a piece turns into that side's
  own private home stretch (6 cells) leading to the centre.
- Rolling a 4 or 6 is a special throw and grants an extra roll, provided a
  legal move was actually made.
- First side to bring all 4 pieces home wins.

Dayakattam has real regional variations across Tamil Nadu, and this project
doesn't claim to capture all of them, or to know its precise historical
age — see the in-app "About" panel for what is and isn't claimed. The
engine is deliberately kept separate from the board/rendering layer so
another variant's rules could be swapped in later (see section 8).

## 5. Randomness

Every Dayam throw (`src/game/dice.ts`) is generated with
`crypto.getRandomValues()` **before** any animation begins. The 3D tumble
in `Scene3D.animateDiceRoll()` is purely cosmetic — it's handed the
already-decided result and animates toward it, so the animation can never
influence, and never needs to match a script for, the outcome.

## 6. AI algorithm

`src/ai/expectimax.ts` implements **expectimax with chance nodes** over the
dice-roll distribution (`P(1)=0.5, P(4)=0.25, P(6)=0.25`), not plain
minimax — the dice are genuinely random, so the search takes an expectation
over possible rolls rather than assuming an adversary chooses them.

- **MAX/MIN nodes**: whoever is rolling picks the best move for themselves
  from the legal moves available for that roll.
- **CHANCE nodes**: before a move is chosen, the search branches over the
  three possible roll outcomes, weighted by their real probabilities.
- **Depth accounting**: every dice throw costs one ply of search depth,
  *including* special-throw (extra turn) branches. This is what bounds the
  recursion — a hypothetical chain of "always rolls a special throw" can't
  blow the call stack, because depth still decrements on every throw.
- **Transposition table**: a `Map` keyed by `(depth, side-to-roll, both
  sides' piece positions)` caches repeated subtrees within a single search.
- **Heuristic evaluation** (`heuristic()`) at the search horizon scores a
  position from a side's perspective using: progress of each piece, a
  bonus for reaching the private home stretch or a safe cell, a large bonus
  per piece home, and a penalty for pieces currently exposed to capture
  (`vulnerability()` checks whether any opposing piece could land on them
  next turn with a 1, 4 or 6).
- **Difficulty** scales search depth (1 ply for Easy up to 4 for Expert)
  and adds a shrinking amount of random noise to the AI's move evaluation
  at lower difficulties, so Easy plays noticeably looser than Expert
  without ever making an illegal move.

The AI calls the exact same `legalMoves()` function a human move uses, and
its dice come from the exact same `rollDayam()` — it has no hidden
information and cannot alter probabilities in its own favour.

## 7. How the 3D objects were created

Everything in `src/three/scene.ts` is procedural Three.js geometry — no
imported 3D model files:

- **Board**: tiled `BoxGeometry` cells laid out from the same coordinate
  table (`src/game/board.ts`) the rules engine uses, with a small
  `RingGeometry` diamond marker over each safe cell.
- **Pieces**: a `CylinderGeometry` body with a `SphereGeometry` cap, tinted
  per side.
- **Dayam dice**: two `BoxGeometry` bars with `CylinderGeometry` recessed
  holes, brass `MeshStandardMaterial`, tumbled with a procedural
  animation (not a physics engine) that always resolves to the
  already-rolled result.
- **Cowrie shells**: a `LatheGeometry` profile revolved into a teardrop
  shell shape, scattered decoratively near the board.

## 8. Adding another regional rule variant

The engine was split out specifically so this is possible without touching
rendering code:

1. Duplicate `src/game/board.ts` and `src/game/rules.ts` (e.g. into
   `src/game/variants/yourVariant/`), and adjust the loop layout, safe
   cells, entry conditions, or scoring table for that tradition.
2. Point `src/ai/expectimax.ts` at the variant's `legalMoves` — the search
   algorithm itself doesn't assume anything variant-specific beyond the
   `Move`/`GameState` shapes in `src/types`.
3. `src/three/scene.ts` reads board layout from `src/game/board.ts`, so a
   new layout renders automatically as long as it exports the same shape
   (`LOOP`, `SAFE_CELLS`, `SIDES`, `cellWorld`, `loopCellIndex`).
4. Add a variant switch in `src/ui/controller.ts` (or a new menu option) to
   let a player choose which rule set to load.

## Scope notes

This project runs entirely client-side — no backend. It does not include a
Web Worker for the AI (the search comfortably finishes in well under a
second even at Expert difficulty, verified in `tests/ai.test.ts`), and
audio is fully procedural rather than sourced from audio files.

## Keyboard Controls

| Key | Action |
|---|---|
| Enter | Roll the Dayam |
| R | Restart the current game |
| Esc | Close an open menu |
| Ctrl + D | Toggle debug information |

## Development Workflow

1. Make a focused change.
2. Test the application locally.
3. Commit the change with a descriptive message.
4. Push the change to GitHub.
5. Tag stable project versions.