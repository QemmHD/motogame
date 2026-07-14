// logic.js — required deploy module. This is a solo, client-only game, so the
// rules module is the platform's minimal single-player stub (no server logic,
// no timers). All gameplay lives in the client (index.html + game.js).
export const meta = { game: 'moto-rush-x3', minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
