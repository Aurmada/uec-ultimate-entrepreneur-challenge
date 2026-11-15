// Which renderer pieces a page load turns on: the 3D fighters, fighters drawn
// at screen resolution, the rendered stages and the fighting-game effects.
// RENDER-ONLY, every one of them; nothing here reaches the simulation.
//
// The game is 3D, and only 3D (v3.22.4, the owner's call: "let's only have
// 3d"). It was 3D by default from v3.14, with the classic 2D game as the
// Settings choice until v3.22.2 and the fallback without WebGL2 until v3.22.4.
// Now a browser that cannot draw it is told so (main.js, the no-3D notice)
// rather than given the 2D game, and the address cannot turn the 3D fighters
// off or limit them to some fighters (?gl=0 and ?gl=max,dex are read no
// more). It still turns the other pieces on and off one at a time, for the lab
// (&stages=0, ?sharp, ?fx=0, ?perf and so on). The 2D rig is the lab's alone
// (drawFighter.js RIG2D).
//
// In 3D the roster fighters wear their sculpted models and fight in their
// own forms (`sculpts`, models3d.js and forms.js); a player's own founder
// wears the founder model, whose looks are theirs to choose. ?sculpts=0 puts
// the roster back in the founder model, and ?athlete (the athlete bodies,
// on test) does too, so each can still be seen alone.

export function graphicsFlags(search, { webgl2 = true } = {}) {
  const q = new URLSearchParams(search || '');
  const gl = !!webgl2;
  const on = (name) => (q.has(name) ? q.get(name) !== '0' : gl);
  return {
    gl,
    ids: [],
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
