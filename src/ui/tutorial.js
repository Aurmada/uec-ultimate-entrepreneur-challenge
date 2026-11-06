// First-fight onboarding: five quick cards, then straight into the action.

import { Save } from '../state.js';
import { audio } from '../engine/audio.js';
import { isTouchDevice } from '../engine/input.js';

const SLIDES = [
  {
    emoji: '🥊',
    title: 'WELCOME, FOUNDER',
    body: () => isTouchDevice()
      ? 'Win <b>2 of 3 rounds</b> — drain their health bar or lead when time runs out. Use the on-screen pads: <b>◀ ▶</b> to move, <b>▲</b> to jump.'
      : 'Win <b>2 of 3 rounds</b> — drain their health bar or lead when time runs out. <b>Left hand on W A S D</b>: move with <b>A D</b>, jump with <b>W</b>, crouch with <b>S</b>. <b>Right hand on H J K</b>: that\'s your fists and feet. (The arrow keys move you too.)',
  },
  {
    emoji: '👊',
    title: 'THREE STRIKES',
    body: () => isTouchDevice()
      ? 'Three basic attacks: <b>🖐 Slap</b> (fastest), <b>👊 Punch</b>, <b>👟 Kick</b> (hardest). <b>🚀 Launch</b> is an uppercut that knocks jumpers out of the air. Use <b>▼</b> to crouch — you can still attack from down there, and you duck under high shots.'
      : 'Three basic attacks: <b>H</b> = <b>🖐 Slap</b> (fastest), <b>J</b> = <b>👊 Punch</b>, <b>K</b> = <b>👟 Kick</b> (hardest). <b>N</b> = <b>🚀 Launch</b>, an uppercut that knocks jumpers out of the air. Hold <b>S</b> to crouch — you can still attack from down there, and you duck under high shots.',
  },
  {
    emoji: '🔗',
    title: 'CHAIN THEM UP',
    body: () => 'One rule, no order to memorise: when an attack <b>lands</b>, hit <b>any other attack button</b> and it chains. 🖐 👊 👟 in any mix, up to <b>5</b>, then finish with <b>⚡</b>, <b>⚖️</b> or <b>💸</b>. Just keep pressing while you\'re connecting.',
  },
  {
    emoji: '📄',
    title: 'SERVE THE NDA',
    body: () => isTouchDevice()
      ? 'Hold <b>📄 NDA</b> to shut their attack down to a scratch. <b>Tap it the instant their hit lands</b> and you <b>PARRY</b> — they stagger, you gain energy, and the counter is free. Hostile Takeovers ignore paperwork: jump those.'
      : 'Hold <b>/</b> (or Q) to serve an <b>📄 NDA</b> and shut their attack down to a scratch. <b>Tap it the instant their hit lands</b> and you <b>PARRY</b> — they stagger, you gain energy, and the counter is free. Hostile Takeovers ignore paperwork: jump those.',
  },
  {
    emoji: '⚡',
    title: 'BUILD YOUR VALUATION',
    body: () => isTouchDevice()
      ? 'Hits fill your <b>energy meter</b>: at 25 hurl a <b>⚖️ Cease &amp; Desist</b>, at 50 fire your <b>⚡ Special</b>, at 100 go <b>🦄 UNICORN MODE</b>. <b>💸</b> steals their energy, <b>💨</b> dashes — and grab the <b>mystery briefcases</b>. They hide secret powers! Your fighter\'s <b>own moves</b> are on the pause menu.'
      : 'Hits fill your <b>energy meter</b>: at 25 hurl a <b>⚖️ Cease &amp; Desist</b> (I), at 50 fire your <b>⚡ Special</b> (L), at 100 go <b>🦄 UNICORN MODE</b> (U). <b>M</b> steals energy, <b>O</b> dashes — and grab the <b>mystery briefcases</b>. They hide secret powers! Your fighter\'s <b>own moves</b> are on <b>🎮</b> and the pause menu.',
  },
];

export function shouldShowTutorial() {
  return !Save.data.tutorialSeen;
}

export function showTutorial(onDone) {
  const root = document.getElementById('tutorial');
  const body = document.getElementById('tut-body');
  const dots = document.getElementById('tut-dots');
  const btnNext = document.getElementById('tut-next');
  const btnSkip = document.getElementById('tut-skip');
  let i = 0;

  const renderDots = () => {
    dots.innerHTML = SLIDES.map((_, d) => `<i class="${d === i ? 'on' : ''}"></i>`).join('');
  };
  const renderSlide = () => {
    const s = SLIDES[i];
    body.innerHTML = `<span class="big-emoji">${s.emoji}</span><h2>${s.title}</h2><p>${s.body()}</p>`;
    btnNext.textContent = i === SLIDES.length - 1 ? "LET'S FIGHT ➤" : 'NEXT ➤';
    renderDots();
  };

  const finish = () => {
    Save.markTutorialSeen();
    root.classList.add('hidden');
    btnNext.onclick = btnSkip.onclick = null;
    onDone();
  };

  btnNext.onclick = () => {
    audio.sfx('click');
    if (i < SLIDES.length - 1) { i++; renderSlide(); } else finish();
  };
  btnSkip.onclick = () => { audio.sfx('back'); finish(); };

  renderSlide();
  root.classList.remove('hidden');
}
