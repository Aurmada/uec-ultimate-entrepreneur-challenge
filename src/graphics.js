// Which renderer pieces a page load turns on: the 3D fighters, fighters drawn
// at screen resolution, the rendered stages and the fighting-game effects.
// RENDER-ONLY, every one of them; nothing here reaches the simulation.
//
// The game is 3D (since v3.14, the owner's call once it played well on his
// phone), unless the browser has no WebGL2 to draw it with: then it is the
// classic 2D game, pixel for pixel. Since v3.22.2 that is the only way it
// goes, the owner's call again: one version, 3D. Settings had a choice of 2D
// or 3D from v3.13; it is gone, and a 2D choice a player saved then is no
// longer read. The address still turns the pieces on and off one at a time
// (?gl, ?gl=max,dex, ?gl=0, &stages=0, ?sharp, ?stages, ?fx and so on), for
// the lab and for seeing the 2D fallback on a browser that could draw 3D.
//
// In 3D the roster fighters wear their sculpted models and fight in their
// own forms (`sculpts`, models3d.js and forms.js); a player's own founder
// wears the founder model, whose looks are theirs to choose. ?sculpts=0 puts
// the roster back in the founder model, and ?athlete (the athlete bodies,
// on test) does too, so each can still be seen alone.

export function graphicsFlags(search, { webgl2 = true } = {}) {
  const q = new URLSearchParams(search || '');
  const gl = q.has('gl') ? q.get('gl') !== '0' : webgl2;
  const ids = gl ? (q.get('gl') || '').split(',').map((s) => s.trim()).filter(Boolean) : [];
  const on = (name) => (q.has(name) ? q.get(name) !== '0' : gl);
  return {
    gl,
    ids,
    sculpts: q.has('sculpts') ? gl && q.get('sculpts') !== '0' : gl && !q.has('athlete'),
    perf: q.has('perf'),
    sharp: on('sharp'),
    stages: on('stages'),
    fx: on('fx'),
  };
}

// Whether this browser can draw the 3D fighters at all (gl3d needs WebGL2).
// The context made to ask is let go at once: a page may hold only so many.
export function hasWebGL2() {
  try {
    const g = document.createElement('canvas').getContext('webgl2');
    g?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!g;
  } catch {
    return false;
  }
}
