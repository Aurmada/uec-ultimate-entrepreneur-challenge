// The fight's drawing resolution, lowered for a phone that cannot draw it at
// full. RENDER-ONLY: it sizes the game canvas, and nothing in the fight reads
// it. Round seven of the phone test (lab/phone-test.html, v3.21.1) found a
// budget Android (Adreno 613) at 21 frames a second at twice the stage's size
// and 31 at its own size, the stage light, its pictures and the hit effects
// making little difference beside it. A phone that holds 60 is never touched.
//
// The governor is fed the gap between frames while a round is being fought
// (main.js loop) and answers with a new scale when it should step down:
// RESOLUTION in config.js has the numbers. It keeps its step for the rest of
// the session, so the next match starts where the last one settled rather
// than finding it again. A step that does not pay (round eight's iPhone in 2D,
// 19 fps at 2x and 20.6 at 1x; a phone that Low Power Mode holds to 30) is
// taken back once, and the governor judges nothing more that session: the
// fight drawn sharp at the same frame rate rather than soft.

import { RESOLUTION } from '../config.js';

// The ratio the fight is really shown at: device pixels across the stage as
// it lies on the screen, over the stage's own width. The device's ratio alone
// is right for a phone, whose stage is narrower than 960 CSS px, and wrong for
// a monitor: at ratio 1 a window 1920 wide showed a 960 px canvas stretched to
// twice its size, and a laptop at 125% a 1200 px one stretched to 1920, soft
// either way (seen 2026-11-15, a 1280 px window at ratio 1). So the larger of
// the two: never below the device's ratio, which is what every phone was
// measured at, and up to the size shown on a screen larger than the stage.
export function shownRatio(dpr, shownWidth, stageWidth) {
  const ratio = dpr > 0 ? dpr : 1;
  if (!(shownWidth > 0) || !(stageWidth > 0)) return ratio;
  return Math.max(ratio, (ratio * shownWidth) / stageWidth);
}

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
    this.before = null;               // the frame rate before the step being proved
    this.done = false;                // a step was taken back: nothing more this session
    this.limit = null;                // the scale a step settled on: a refit stays under it
    this.restart();
  }

  get scale() { return this.steps[this.at]; }

  // The ratio changed: the window was resized, or the fight screen was first
  // laid out. Returns the scale to draw at when it changes, otherwise null.
  // A governor that has not stepped starts from the new top. One that has
  // stays at or under the scale it settled on: a wider window does not make a
  // slow graphics chip faster.
  refit(ratio) {
    const steps = resolutionSteps(ratio);
    if (steps[0] === this.steps[0]) return null;
    const was = this.scale;
    this.steps = steps;
    const kept = this.limit === null ? 0 : steps.findIndex((s) => s <= this.limit);
    this.at = kept < 0 ? steps.length - 1 : kept;
    this.before = null;
    this.restart();
    return this.scale === was ? null : this.scale;
  }

  // Waits SETTLE ms again before judging: a new match, or a new scale.
  restart() {
    this.settled = 0;
    this.frames = 0;
    this.time = 0;
  }

  // One frame's gap in ms. Returns the scale to draw at when it changes,
  // otherwise null.
  sample(gap) {
    if (this.done || !(gap > 0) || gap > RESOLUTION.STALL) return null;
    if (this.settled < RESOLUTION.SETTLE) { this.settled += gap; return null; }
    this.frames++;
    this.time += gap;
    if (this.time < RESOLUTION.WINDOW) return null;
    const fps = (this.frames * 1000) / this.time;
    this.frames = 0;
    this.time = 0;
    // the first window after a step says whether it paid
    if (this.before !== null) {
      const paid = fps >= this.before * (1 + RESOLUTION.MIN_GAIN);
      this.before = null;
      if (!paid) {
        this.at--;
        this.done = true;
        this.limit = this.scale;
        return this.scale;
      }
    }
    if (fps >= RESOLUTION.MIN_FPS || this.at === this.steps.length - 1) return null;
    this.before = fps;
    this.at++;
    this.limit = this.scale;
    this.restart();
    return this.scale;
  }
}
