// The fight's drawing resolution, lowered for a phone that cannot draw it at
// full. RENDER-ONLY: it sizes the game canvas, and nothing in the fight reads
// it. Round seven of the phone test (lab/phone-test.html, v3.21.1) found a
// budget Android (Adreno 613) at 21 frames a second at twice the stage's size
// and 31 at its own size, the stage light, its pictures and the hit effects
// making little difference beside it. A phone that holds 60 is never touched.
//
// The governor is fed the gap between frames while a round is being fought
// (main.js loop) and answers with a new scale when it should step down:
// RESOLUTION in config.js has the numbers. It only ever steps down, and keeps
// its step for the rest of the session, so the next match starts where the
// last one settled rather than finding it again.

import { RESOLUTION } from '../config.js';

// The scales to try, from the device's own ratio (up to the first of STEPS)
// down: a phone at 1.5 starts at 1.5, one at 1 has nowhere to go.
export function resolutionSteps(dpr) {
  const top = Math.min(RESOLUTION.STEPS[0], dpr || 1);
  return [top, ...RESOLUTION.STEPS.filter((s) => s < top)];
}

export class ResolutionGovernor {
  constructor(dpr) {
    this.steps = resolutionSteps(dpr);
    this.at = 0;
    this.restart();
  }

  get scale() { return this.steps[this.at]; }

  // Waits SETTLE ms again before judging: a new match, or a new scale.
  restart() {
    this.settled = 0;
    this.frames = 0;
    this.time = 0;
  }

  // One frame's gap in ms. Returns the scale to draw at when it steps down,
  // otherwise null.
  sample(gap) {
    if (!(gap > 0) || gap > RESOLUTION.STALL) return null;
    if (this.settled < RESOLUTION.SETTLE) { this.settled += gap; return null; }
    this.frames++;
    this.time += gap;
    if (this.time < RESOLUTION.WINDOW) return null;
    const fps = (this.frames * 1000) / this.time;
    this.frames = 0;
    this.time = 0;
    if (fps >= RESOLUTION.MIN_FPS || this.at === this.steps.length - 1) return null;
    this.at++;
    this.restart();
    return this.scale;
  }
}
