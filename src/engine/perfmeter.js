// How a match ran: its frame rate, its share of slow frames and the time the
// drawing took, for the report sent when it ends (net/perf.js). RENDER-ONLY:
// main.js feeds it the gap between frames and the time renderGame took while
// a round is being fought, and nothing in the fight reads it.
//
// The gaps are kept as a count per whole millisecond, so the median (what a
// slow frame is judged against) costs one add a frame and no list that grows
// with the match. PERF in config.js has the numbers.

import { PERF } from '../config.js';

const round = (x, places) => { const k = 10 ** places; return Math.round(x * k) / k; };

export class PerfMeter {
  constructor() {
    this.gaps = new Uint32Array(PERF.STALL + 1);
    this.restart();
  }

  // A new match.
  restart() {
    this.gaps.fill(0);
    this.frames = 0;
    this.time = 0;
    this.draw = 0;
    this.scales = new Map();          // scale -> { frames, time }, as the resolution steps down
  }

  // One frame: its gap and its drawing time in ms, and the scale it was drawn at.
  sample(gap, drawMs, scale) {
    if (!(gap > 0) || gap > PERF.STALL) return;
    this.gaps[Math.round(gap)]++;
    this.frames++;
    this.time += gap;
    this.draw += drawMs > 0 ? drawMs : 0;
    const s = this.scales.get(scale) || { frames: 0, time: 0 };
    s.frames++;
    s.time += gap;
    this.scales.set(scale, s);
  }

  // The match so far, or null when it was fought for too short a time to say.
  summary() {
    if (this.time < PERF.MIN_SECONDS * 1000) return null;
    let seen = 0, median = 0;
    for (let ms = 0; ms < this.gaps.length; ms++) {
      seen += this.gaps[ms];
      if (seen * 2 >= this.frames) { median = ms; break; }
    }
    let slow = 0;
    for (let ms = Math.floor(median * PERF.SLOW) + 1; ms < this.gaps.length; ms++) slow += this.gaps[ms];
    return {
      fps: round((this.frames * 1000) / this.time, 1),
      slow: round(slow / this.frames, 3),
      draw_ms: round(this.draw / this.frames, 2),
      seconds: round(this.time / 1000, 1),
      // each scale the match was drawn at, in the order it stepped down
      steps: [...this.scales].map(([scale, s]) => ({
        scale, fps: round((s.frames * 1000) / s.time, 1), seconds: round(s.time / 1000, 1),
      })),
    };
  }
}
