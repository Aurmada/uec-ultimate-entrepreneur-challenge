// Which renderer pieces a page load turns on: the 3D fighters, fighters drawn
// at screen resolution, the rendered stages and the fighting-game effects.
// RENDER-ONLY, every one of them; nothing here reaches the simulation.
//
// Two ways in. The address, as before (?gl, ?gl=max,dex, &stages=0, ?sharp,
// ?stages, ?fx and so on), for the lab and for trying one piece alone. And the
// player's own choice in Settings (`graphics: '3d'`), which turns on what ?gl
// does, so a player can try the 3D preview without editing a URL. The address
// wins when it names a piece. With neither, everything is off and the game is
// the classic one, pixel for pixel.

export function graphicsFlags(search, settings = {}) {
  const q = new URLSearchParams(search || '');
  const chosen = settings.graphics === '3d';
  const gl = q.has('gl') || chosen;
  const ids = (q.get('gl') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const on = (name) => (q.has(name) ? q.get(name) !== '0' : gl);
  return {
    gl,
    ids,
    perf: q.has('perf'),
    sharp: on('sharp'),
    stages: on('stages'),
    fx: on('fx'),
  };
}

// The address without the pieces above, for a reload after the Settings
// choice changes: otherwise a ?gl left in the address would outvote it.
export function withoutGraphicsParams(search) {
  const q = new URLSearchParams(search || '');
  for (const k of ['gl', 'perf', 'sharp', 'stages', 'fx']) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : '';
}
