const fileInput = document.getElementById('fileInput');
const takeBtn = document.getElementById('takeBtn');
const doneBtn = document.getElementById('doneBtn');
const addBtn = document.getElementById('addBtn');
const slider = document.getElementById('slider');
const sliderWrap = document.getElementById('sliderWrap');
const hint = document.getElementById('hint');
const buttonsRow = document.getElementById('buttons');
const canvas = document.getElementById('drawing');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const MAX_SIZE = 1400; // shrink big phone photos so processing stays fast
let sourceData = null; // the photo currently being edited

// mode is 'start' (nothing yet), 'editing' (a photo is being tuned),
// or 'floating' (the drawings are waddling around)
let mode = 'start';
const colorPicker = document.getElementById('colorPicker');
let chosenColor = 'black'; // which marker color the next photo is scanned for
let wipeOnLoad = false; // true when the next photo should clear all drawings

// ---------- Buttons ----------

// In the waddling screen this is "Start over", which wipes everything.
// While editing it is "Retake", which only replaces the current photo.
takeBtn.addEventListener('click', () => {
  wipeOnLoad = (mode === 'floating');
  fileInput.click();
});

// Adds another drawing and keeps the existing ones.
// First asks which color was used, then opens the camera.
addBtn.addEventListener('click', () => {
  colorPicker.hidden = false;
});

colorPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-color]');
  if (!btn) return;
  chosenColor = btn.dataset.color;
  colorPicker.hidden = true;
  wipeOnLoad = false;
  fileInput.click(); // still inside the tap, so iOS allows the camera to open
});

doneBtn.addEventListener('click', addCreature);

slider.addEventListener('input', removeBackground);

function enterEditMode() {
  mode = 'editing';
  canvas.style.display = 'block';
  hint.style.display = 'none';
  sliderWrap.style.display = 'block';
  doneBtn.hidden = false;
  addBtn.hidden = true;
  takeBtn.textContent = '🔄 Retake';
}

function enterFloatMode() {
  mode = 'floating';
  canvas.style.display = 'none';
  sliderWrap.style.display = 'none';
  doneBtn.hidden = true;
  addBtn.hidden = false;
  takeBtn.textContent = '🔄 Start over';
}

// ---------- Taking the photo ----------

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    // Start over only wipes once a new photo has actually loaded
    if (wipeOnLoad) wipeCreatures();
    wipeOnLoad = false;

    const scale = Math.min(1, MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    enterEditMode();
    removeBackground();
  };

  img.onerror = () => {
    alert('Could not load that photo, try again');
  };

  img.src = url;
  fileInput.value = ''; // lets you pick the same photo twice
});

// ---------- Removing the paper ----------

// ---------- Ink colors ----------
// Hue is the position on the color wheel (0-360). A pixel counts as this ink
// if its hue is within `full` degrees of `center`, fading to nothing at `end`.
// Tweak these if a marker is being missed or the wrong color sneaks in.
const INK_HUES = {
  red:   { center: 0,   full: 25, end: 45 },  // wraps around 360, handled below
  green: { center: 130, full: 30, end: 55 },
  blue:  { center: 225, full: 30, end: 55 }
};

function hueOf(r, g, b, max, d) {
  let h;
  if (max === r)      h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hueWeight(h, spec) {
  let dist = Math.abs(h - spec.center);
  if (dist > 180) dist = 360 - dist;     // shortest way around the wheel
  if (dist <= spec.full) return 1;
  if (dist >= spec.end) return 0;
  return (spec.end - dist) / (spec.end - spec.full);
}

// ---------- Removing the paper ----------

function removeBackground() {
  if (!sourceData) return;

  const src = sourceData.data;
  const out = ctx.createImageData(sourceData.width, sourceData.height);
  const dst = out.data;
  const s = slider.value / 100; // sensitivity: higher = picks up fainter lines

  if (chosenColor === 'black') {
    // ----- Black: dark and not very colorful -----
    const pixelCount = src.length / 4;

    // Find how bright the paper is (90th percentile of brightness)
    const hist = new Uint32Array(256);
    for (let i = 0; i < src.length; i += 4) {
      const lum = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) | 0;
      hist[lum]++;
    }
    let paper = 255;
    let count = 0;
    for (let v = 0; v < 256; v++) {
      count += hist[v];
      if (count >= pixelCount * 0.9) { paper = v; break; }
    }
    paper = Math.max(paper, 1);

    const hi = 0.70 + 0.25 * s;
    const lo = hi - 0.20;

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const darkness = Math.min(1, Math.max(0, (hi - lum / paper) / (hi - lo)));

      // Dark red/green/blue ink is dark too, so ignore anything clearly colored
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const notColored = 1 - Math.min(1, Math.max(0, (chroma - 35) / 40));

      dst[i] = r; dst[i + 1] = g; dst[i + 2] = b;
      dst[i + 3] = darkness * notColored * 255;
    }
  } else {
    // ----- Red / green / blue: right hue and clearly colorful -----
    const spec = INK_HUES[chosenColor];

    // How colorful (max channel minus min channel) a pixel must be to count.
    // White paper and black ink are both near 0, bright marker is 100+.
    const chromaLo = 70 - 40 * s;
    const chromaHi = chromaLo + 50;

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2];
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);

      let alpha = 0;
      if (d > chromaLo) {
        const colorful = Math.min(1, (d - chromaLo) / (chromaHi - chromaLo));
        alpha = colorful * hueWeight(hueOf(r, g, b, max, d), spec);
      }

      dst[i] = r; dst[i + 1] = g; dst[i + 2] = b;
      dst[i + 3] = alpha * 255;
    }
  }

  ctx.putImageData(out, 0, 0);
}


// ---------- The waddling drawings ----------

const touchLayer = document.getElementById('touchLayer');

const world = document.getElementById('world');
const WORLD_SCALE = 2;      // world is this many screens wide and tall
const PAN_THRESHOLD = 10;   // px a finger must move before it counts as a drag
const HOLD_MS = 150;        // how long you hold still before drawings are pulled in

let worldW = 0, worldH = 0;
let camX = 0, camY = 0;     // top-left of the screen, in world coordinates

function clampCamera() {
  camX = Math.min(Math.max(0, camX), Math.max(0, worldW - window.innerWidth));
  camY = Math.min(Math.max(0, camY), Math.max(0, worldH - window.innerHeight));
}

function applyCamera() {
  world.style.transform = `translate(${-camX}px, ${-camY}px)`;
}

function sizeWorld() {
  worldW = window.innerWidth * WORLD_SCALE;
  worldH = window.innerHeight * WORLD_SCALE;
  world.style.width = worldW + 'px';
  world.style.height = worldH + 'px';
  clampCamera();
  applyCamera();
}

sizeWorld();
// Start in the middle of the world
camX = (worldW - window.innerWidth) / 2;
camY = (worldH - window.innerHeight) / 2;
applyCamera();
window.addEventListener('resize', sizeWorld);

// Tweak these to change how the touch feels
const ATTRACT_SPEED = 240; // top speed (px/s) when rushing toward your finger
const ATTRACT_EASE = 4;    // how quickly they speed up toward it (higher = snappier)
const SPEED_MIN = 25;      // slowest possible base speed (px/s)
const SPEED_RANGE = 150;   // how much faster the fastest ones can be
const DASH_CHANCE = 0.2;   // odds a new mood is a fast dash
const PAUSE_CHANCE = 0.2;  // odds a new mood is stopping to rest
const BURST_MIN = 380;     // scatter speed range (px/s) when you let go
const BURST_MAX = 600;
const SETTLE = 1.5;        // how quickly they calm back to normal drift (higher = faster)

let creatures = []; // every drawing on the screen
let rafId = null;
let lastTime = 0;
let touch = { active: false, mode: 'hold', x: 0, y: 0, sx: 0, sy: 0, lx: 0, ly: 0, t0: 0 };
// x, y are in world coordinates. sx/sy is where the finger started and
// lx/ly is where it was last, both in screen coordinates.

function startTouch(x, y) {
  if (touch.active || mode !== 'floating') return;
  touch.active = true;
  touch.mode = 'hold';
  touch.sx = touch.lx = x;
  touch.sy = touch.ly = y;
  touch.x = x + camX;
  touch.y = y + camY;
  touch.t0 = performance.now();
}

function moveTouch(x, y) {
  if (!touch.active) return;

  // Moved far enough from where it started: this is a drag, not a hold
  if (touch.mode === 'hold' &&
      Math.hypot(x - touch.sx, y - touch.sy) > PAN_THRESHOLD) {
    touch.mode = 'pan';
  }

  if (touch.mode === 'pan') {
    camX -= x - touch.lx;   // drag the world with your finger
    camY -= y - touch.ly;
    clampCamera();
    applyCamera();
  } else {
    touch.x = x + camX;
    touch.y = y + camY;
  }
  touch.lx = x;
  touch.ly = y;
}

function endTouch() {
  if (!touch.active) return;
  touch.active = false;
  if (touch.mode === 'hold') scatter(touch.x, touch.y); // only scatter after a hold
}

// Phone: touch events (preventDefault stops Safari from hijacking the gesture)
touchLayer.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  startTouch(t.clientX, t.clientY);
}, { passive: false });

touchLayer.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  moveTouch(t.clientX, t.clientY);
}, { passive: false });

touchLayer.addEventListener('touchend', (e) => {
  if (e.touches.length === 0) endTouch();
});
touchLayer.addEventListener('touchcancel', endTouch);

// Computer: mouse events
touchLayer.addEventListener('mousedown', (e) => startTouch(e.clientX, e.clientY));
window.addEventListener('mousemove', (e) => moveTouch(e.clientX, e.clientY));
window.addEventListener('mouseup', endTouch);

// Send every drawing flying outward from the point where the finger was
function scatter(fx, fy) {
  for (const c of creatures) {
    const dx = (c.x + c.w / 2) - fx;
    const dy = (c.y + c.h / 2) - fy;
    const dist = Math.hypot(dx, dy);

    // Away from the finger, or a random direction if right on top of it
    let angle = dist > 5 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
    angle += (Math.random() - 0.5) * 1.6; // spread them out a bit

    const burst = BURST_MIN + Math.random() * (BURST_MAX - BURST_MIN);
    c.vx = Math.cos(angle) * burst;
    c.vy = Math.sin(angle) * burst;
  }
}

// ----- Adding and removing drawings -----

function addCreature() {
  // 1. Find the bounding box of the drawing (pixels that aren't transparent)
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    alert('No drawing found. Try raising the sensitivity slider.');
    return;
  }

  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  // 2. Crop just the drawing onto its own new canvas
  const el = document.createElement('canvas');
  el.className = 'creature';
  el.width = bw;
  el.height = bh;
  el.getContext('2d').drawImage(canvas, minX, minY, bw, bh, 0, 0, bw, bh);

  // 3. Size it for the screen
  const target = Math.min(window.innerWidth, window.innerHeight) * 0.3;
  const scale = target / Math.max(bw, bh);
  const cw = bw * scale;
  const ch = bh * scale;
  el.style.width = cw + 'px';
  el.style.height = ch + 'px';
  world.appendChild(el);

  // 4. Give it its own position, drift direction and waddle rhythm
  const viewBottom = buttonsRow.getBoundingClientRect().top - 8;
  const angle = Math.random() * Math.PI * 2;
  const speed = SPEED_MIN + Math.pow(Math.random(), 1.5) * SPEED_RANGE; // mostly slowish, a few speedy
  creatures.push({
    el: el,
    w: cw,
    h: ch,
    x: camX + (window.innerWidth - cw) / 2,
    y: camY + (viewBottom - ch) / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    base: speed,                         // its personal normal speed
    cruise: speed,                       // current target speed (base x mood)
    speedMul: 1,
    moodTimer: Math.random() * 2,        // time until it picks a new mood
    turn: 0,                             // how fast it is curving right now (rad/s)
    turnTarget: 0,
    windy: 0.3 + Math.random() * 1.7,    // how much this one likes to wander
    hopAmt: 3 + Math.random() * 14,      // its normal waddle hop height
    boingAmt: 8 + Math.random() * 26,    // how big it jumps when it hits a wall
    boing: 0,
    tiltAmt: 0.1 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    step: 5 + Math.random() * 9
  });

  enterFloatMode();

  // Start the animation loop if it isn't already running
  if (!rafId) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

function wipeCreatures() {
  for (const c of creatures) c.el.remove();
  creatures = [];
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// Called when a drawing hits a wall: it comes off at a slightly new angle and speed
function jitter(c) {
  const a = (Math.random() - 0.5) * 1.0; // up to about 30 degrees either way
  const cos = Math.cos(a), sin = Math.sin(a);
  const vx = c.vx * cos - c.vy * sin;
  const vy = c.vx * sin + c.vy * cos;
  const boost = 0.7 + Math.random() * 0.9;
  c.vx = vx * boost;
  c.vy = vy * boost;
  // Its normal speed also drifts a bit with each bounce, so personalities change over time
  c.base = Math.min(SPEED_MIN + SPEED_RANGE, Math.max(SPEED_MIN, c.base * (0.75 + Math.random() * 0.6)));
  c.boing = 1; // triggers an extra hop
}

// ----- The animation loop -----

function tick(now) {
  if (creatures.length === 0) {
    rafId = null;
    return;
  }

  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  const W = worldW;
  // Floor of the world, leaving room for the button row at the bottom of the screen
  const bottom = worldH - (window.innerHeight - buttonsRow.getBoundingClientRect().top) - 8;

  for (const c of creatures) {
      if (touch.active && touch.mode === 'hold' && now - touch.t0 > HOLD_MS) {
      // Finger is down: steer toward it, slowing down as they get close
      const dx = touch.x - (c.x + c.w / 2);
      const dy = touch.y - (c.y + c.h / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const want = Math.min(ATTRACT_SPEED, dist * 1.5);
      const ease = Math.min(1, ATTRACT_EASE * dt);
      c.vx += (dx / dist * want - c.vx) * ease;
      c.vy += (dy / dist * want - c.vy) * ease;
        } else {
      // Pick a new mood every so often: rest, dash, or stroll
      c.moodTimer -= dt;
      if (c.moodTimer <= 0) {
        const r = Math.random();
        if (r < PAUSE_CHANCE)                  c.speedMul = 0.05;
        else if (r < PAUSE_CHANCE + DASH_CHANCE) c.speedMul = 2.2 + Math.random() * 1.3;
        else                                   c.speedMul = 0.6 + Math.random() * 0.8;
        c.moodTimer = 0.8 + Math.random() * 3;
        c.turnTarget = (Math.random() - 0.5) * c.windy * 3;
      }
      c.cruise = c.base * c.speedMul;

      // Curve gently toward this mood's turn rate
      c.turn += (c.turnTarget - c.turn) * Math.min(1, 2 * dt);
      const a = c.turn * dt;
      const cos = Math.cos(a), sin = Math.sin(a);
      const nvx = c.vx * cos - c.vy * sin;
      const nvy = c.vx * sin + c.vy * cos;
      c.vx = nvx;
      c.vy = nvy;

      // Ease toward the target speed, keeping the direction
      const sp = Math.hypot(c.vx, c.vy) || 1;
      const newSp = c.cruise + (sp - c.cruise) * Math.exp(-SETTLE * dt);
      c.vx *= newSp / sp;
      c.vy *= newSp / sp;
    }

    // Move
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // Bounce off the edges
    if (c.x < 0)           { c.x = 0;           c.vx = Math.abs(c.vx);  jitter(c); c.vx = Math.abs(c.vx); }
    if (c.x + c.w > W)     { c.x = W - c.w;     c.vx = -Math.abs(c.vx); jitter(c); c.vx = -Math.abs(c.vx); }
    if (c.y < 0)           { c.y = 0;           c.vy = Math.abs(c.vy);  jitter(c); c.vy = Math.abs(c.vy); }
    if (c.y + c.h > bottom){ c.y = bottom - c.h; c.vy = -Math.abs(c.vy); jitter(c); c.vy = -Math.abs(c.vy); }

    // Waddle in time with how fast it's moving (slow when resting, quick when dashing)
    const speedNow = Math.hypot(c.vx, c.vy);
    const excite = Math.min(2.5, Math.max(0.3, speedNow / c.base));
    c.phase += dt * c.step * excite;
    c.boing = Math.max(0, c.boing - dt * 3);

    const tilt = Math.sin(c.phase) * c.tiltAmt;
    const hop = Math.abs(Math.sin(c.phase)) * c.hopAmt + c.boing * c.boingAmt;

    c.el.style.transform =
      `translate(${c.x}px, ${c.y - hop}px) rotate(${tilt}rad)`;

  rafId = requestAnimationFrame(tick);

}}