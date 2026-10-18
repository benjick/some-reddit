// Deliberately no explanation of why this page was blocked and no link back to
// it — either would invite arguing with the block, and there is no escape
// hatch by design. Just a countdown into a breathing exercise.

const IN = 4000;
const OUT = 6000;
const CYCLE = IN + OUT;
const COUNTDOWN_FROM = 3;

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = document.querySelector<HTMLCanvasElement>('#c')!;
const ctx = cv.getContext('2d')!;
const intro = document.querySelector<HTMLElement>('#intro')!;
const count = document.querySelector<HTMLElement>('#count')!;
const cue = document.querySelector<HTMLElement>('#cue')!;

let W = 0;
let H = 0;
let lineColor = '';

function readTheme() {
  lineColor = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const phaseOf = (t: number) => ((t % CYCLE) + CYCLE) % CYCLE;

// size and squiggle are both 0..1
function state(t: number) {
  const p = phaseOf(t);
  if (p < IN) return { size: ease(p / IN), squiggle: 0 };
  const x = (p - IN) / OUT;
  return { size: 1 - ease(x), squiggle: Math.pow(Math.sin(Math.PI * x), 1.4) };
}

// main ring plus two faint echoes that trail behind it
const rings = [
  { lag: 0, alpha: 1, width: 4 },
  { lag: 450, alpha: 0.35, width: 2 },
  { lag: 900, alpha: 0.15, width: 1.5 },
];
const MIN = 0.16; // ring radius as a share of the shorter screen side
const MAX = 0.3;

// faint guides at the smallest and largest size; the one you're heading toward is brighter
function drawGuides(t: number) {
  const unit = Math.min(W, H);
  const p = phaseOf(t);
  const towardMax = p < IN;
  const fade = towardMax ? Math.min(1, p / 600) : Math.min(1, (p - IN) / 600);
  const hiMax = towardMax ? 0.08 + 0.17 * fade : 0.25 - 0.17 * fade;
  const hiMin = 0.33 - hiMax;
  ctx.lineWidth = 1;
  ctx.strokeStyle = lineColor;
  ctx.setLineDash([2, 6]);
  for (const [r, a] of [
    [MAX, hiMax],
    [MIN, hiMin],
  ] as const) {
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, unit * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawRing(ring: (typeof rings)[number], t: number) {
  const s = state(t - ring.lag);
  const unit = Math.min(W, H);
  const base = unit * (MIN + s.size * (MAX - MIN));
  const amp = unit * 0.012 * s.squiggle;
  const n = 720;
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    // one clean, regular wave that flows around the ring
    const r = base + amp * Math.sin(a * 22 - t * 0.0028);
    const x = W / 2 + Math.cos(a) * r;
    const y = H / 2 + Math.sin(a) * r;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.globalAlpha = ring.alpha;
  ctx.lineWidth = ring.width;
  ctx.strokeStyle = lineColor;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

let breathing = false;
let lastPhase = '';
let t0: number | null = null;

function frame(now: number) {
  if (t0 === null) t0 = now;
  const t = now - t0; // every visit starts at the beginning of an inhale
  ctx.clearRect(0, 0, W, H);
  drawGuides(t);
  for (const ring of [...rings].reverse()) drawRing(ring, t);

  const phase = phaseOf(t) < IN ? 'breathe in' : 'breathe out';
  if (phase !== lastPhase) {
    cue.style.opacity = '0';
    setTimeout(
      () => {
        cue.textContent = phase;
        cue.style.opacity = '0.75';
      },
      lastPhase ? 400 : 0,
    );
    lastPhase = phase;
  }
  if (!reduce) requestAnimationFrame(frame);
}

function startBreathing() {
  breathing = true;
  intro.classList.add('gone');
  cv.classList.add('on');
  if (reduce) {
    lastPhase = 'breathe in';
    t0 = 0;
    cue.textContent = 'breathe';
    cue.style.opacity = '0.75';
    frame(IN - 1);
  } else {
    requestAnimationFrame(frame);
  }
}

function countdown(n: number) {
  if (n === 0) return startBreathing();
  count.textContent = String(n);
  setTimeout(() => countdown(n - 1), 1000);
}

readTheme();
resize();
addEventListener('resize', () => {
  resize();
  if (breathing && reduce) frame(IN - 1);
});
// fresh inhale when you come back to the tab
document.addEventListener('visibilitychange', () => {
  if (breathing && !document.hidden && !reduce) {
    t0 = null;
    lastPhase = '';
  }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  readTheme();
  if (breathing && reduce) frame(IN - 1);
});

// let the sentence land before the countdown starts
setTimeout(() => countdown(COUNTDOWN_FROM), 1500);
