const fileInput = document.getElementById('fileInput');
const takeBtn = document.getElementById('takeBtn');
const doneBtn = document.getElementById('doneBtn');
const addBtn = document.getElementById('addBtn');
const slider = document.getElementById('slider');
const sliderWrap = document.getElementById('sliderWrap');
const rotateBtn = document.getElementById('rotateBtn');
const buttonsRow = document.getElementById('buttons');
const canvas = document.getElementById('drawing');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const controls = document.getElementById('controls');

const MAX_SIZE = 1400; // shrink big phone photos so processing stays fast
let sourceData = null; // the photo currently being edited

// mode is 'start' (nothing yet), 'editing' (a photo is being tuned),
// or 'floating' (the drawings are waddling around)
let mode = 'start';
const colorPicker = document.getElementById('colorPicker');
let chosenColor = 'red'; // which marker color the next photo is scanned for
let wipeOnLoad = false; // true when the next photo should clear all drawings

// How many 90-degree clockwise turns your photos need to look upright.
// Set by the Rotate button and remembered for next time.
let photoTurns = 0;
try { photoTurns = parseInt(localStorage.getItem('photoTurns'), 10) || 0; } catch (e) {}

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
  takeBtn.hidden = false;
  rotateBtn.hidden = false;
  sliderWrap.style.display = 'block';
  doneBtn.hidden = false;
  addBtn.hidden = true;
  takeBtn.textContent = '🔄 Retake';
  tools.hidden = true;
}

function enterFloatMode() {
  mode = 'floating';
  canvas.style.display = 'none';
  sliderWrap.style.display = 'none';
  doneBtn.hidden = true;
  addBtn.hidden = false;
  takeBtn.textContent = '🔄 Start over';
  tools.hidden = false;
  rotateBtn.hidden = true;
  takeBtn.hidden = creatures.length === 0; // "Start over" only shows once there's something to wipe
}

// ---------- Taking the photo ----------
// Turns the current photo 90 degrees clockwise (does not redo the background removal)
function rotateSourceOnce() {
  const tmp = document.createElement('canvas');
  tmp.width = sourceData.width;
  tmp.height = sourceData.height;
  tmp.getContext('2d').putImageData(sourceData, 0, 0);

  canvas.width = tmp.height;
  canvas.height = tmp.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(tmp, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

rotateBtn.addEventListener('click', () => {
  if (!sourceData) return;
  rotateSourceOnce();
  photoTurns = (photoTurns + 1) % 4;
  try { localStorage.setItem('photoTurns', photoTurns); } catch (e) {}
  removeBackground();
});


fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  setTimeout(applyOrientation, 300); // Safari can report the new size late
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
    for (let i = 0; i < photoTurns; i++) rotateSourceOnce();
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
const INK_HUES = {
  red:    { center: 0,   full: 25, end: 50 },
  green:  { center: 135, full: 40, end: 70 },
  blue:   { center: 215, full: 25, end: 50 },
  purple: { center: 275, full: 25, end: 50 }
};

const INK_BOOST = 1.5; // deepens pale pencil so it shows on the background (1 = off)

function hueOf(r, g, b, max, d) {
  let h;
  if (max === r)      h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hueDist(h, center) {
  const d = Math.abs(h - center);
  return d > 180 ? 360 - d : d;
}

function hueWeight(h, spec) {
  const dist = hueDist(h, spec.center);
  if (dist <= spec.full) return 1;
  if (dist >= spec.end) return 0;
  return (spec.end - dist) / (spec.end - spec.full);
}

// Which of the four inks is this hue closest to?
function nearestInk(h) {
  let best = null, bestD = 999;
  for (const name in INK_HUES) {
    const d = hueDist(h, INK_HUES[name].center);
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

function percentile(hist, total, frac) {
  let c = 0;
  for (let v = 0; v < 256; v++) {
    c += hist[v];
    if (c >= total * frac) return v;
  }
  return 255;
}

// ---------- Removing the paper ----------

function removeBackground() {
  if (!sourceData) return;

  const src = sourceData.data;
  const out = ctx.createImageData(sourceData.width, sourceData.height);
  const dst = out.data;
  const pixelCount = src.length / 4;
  const s = slider.value / 100; // sensitivity: higher = picks up fainter lines

  // 1. Find the paper's color in each channel (90th percentile)
  const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256);
  for (let i = 0; i < src.length; i += 4) {
    hr[src[i]]++; hg[src[i + 1]]++; hb[src[i + 2]]++;
  }
  const pr = Math.max(percentile(hr, pixelCount, 0.9), 1);
  const pg = Math.max(percentile(hg, pixelCount, 0.9), 1);
  const pb = Math.max(percentile(hb, pixelCount, 0.9), 1);

  // 2. How colorful (0-1) a pixel must be to count. Slider lowers it.
  const lo = 0.20 - 0.17 * s;
  const hi = lo + 0.12;
  const spec = INK_HUES[chosenColor];

  for (let i = 0; i < src.length; i += 4) {
    // Divide out the paper color so the paper becomes neutral white
    const r = Math.min(1, src[i] / pr);
    const g = Math.min(1, src[i + 1] / pg);
    const b = Math.min(1, src[i + 2] / pb);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);

    let alpha = 0;
    if (d > lo) {
      const hue = hueOf(r, g, b, max, d);
      if (nearestInk(hue) === chosenColor) {
        alpha = Math.min(1, (d - lo) / (hi - lo)) * hueWeight(hue, spec);
      }
    }

    // Deepen the color a little so pale pencil stays visible
    dst[i]     = 255 * Math.pow(r, INK_BOOST);
    dst[i + 1] = 255 * Math.pow(g, INK_BOOST);
    dst[i + 2] = 255 * Math.pow(b, INK_BOOST);
    dst[i + 3] = alpha * 255;
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

// ---------- Keeping the layout sideways ----------
// If the phone reports portrait (e.g. after the camera), rotate the whole page 90 degrees.
// If the interface looks upside down, change this to 'ccw'.
const ROTATE_DIR = 'cw';
let rotated = false;

// The size of the screen as the layout sees it (swapped when rotated)
function layoutW() { return rotated ? window.innerHeight : window.innerWidth; }
function layoutH() { return rotated ? window.innerWidth : window.innerHeight; }

// Turns a screen touch position into a layout position
function toLayout(cx, cy) {
  if (!rotated) return { x: cx, y: cy };
  if (ROTATE_DIR === 'cw') return { x: cy, y: window.innerWidth - cx };
  return { x: window.innerHeight - cy, y: cx };
}

// Top edge of the button row, in layout coordinates (not affected by rotation)
function buttonsTop() {
  const pb = parseFloat(getComputedStyle(controls).paddingBottom) || 0;
  return layoutH() - pb - buttonsRow.offsetHeight;
}

function applyOrientation() {
  rotated = window.innerHeight > window.innerWidth;
  const b = document.body;
  b.classList.toggle('rotated', rotated);
  if (rotated) {
    b.style.width = window.innerHeight + 'px';
    b.style.height = window.innerWidth + 'px';
    b.style.transform = ROTATE_DIR === 'cw'
      ? `translateX(${window.innerWidth}px) rotate(90deg)`
      : `translateY(${window.innerHeight}px) rotate(-90deg)`;
  } else {
    b.style.width = b.style.height = b.style.transform = '';
  }
  sizeWorld();
}

function clampCamera() {
  camX = Math.min(Math.max(0, camX), Math.max(0, worldW - layoutW()));
  camY = Math.min(Math.max(0, camY), Math.max(0, worldH - layoutH()));
}

function applyCamera() {
  world.style.transform = `translate(${-camX}px, ${-camY}px)`;
}

function sizeWorld() {
  worldW = layoutW() * WORLD_SCALE;
  worldH = layoutH() * WORLD_SCALE;
  world.style.width = worldW + 'px';
  world.style.height = worldH + 'px';
  clampCamera();
  applyCamera();
}

sizeWorld();
applyOrientation();
// Start in the middle of the world
camX = (worldW - layoutW()) / 2;
camY = (worldH - layoutH()) / 2;
applyCamera();

window.addEventListener('resize', applyOrientation);
window.addEventListener('orientationchange', () => setTimeout(applyOrientation, 200));
window.addEventListener('pageshow', applyOrientation);
document.addEventListener('visibilitychange', applyOrientation);

// Tweak these to change how the touch feels
const ATTRACT_SPEED = 240; // top speed (px/s) when rushing toward your finger
const ATTRACT_EASE = 4;    // how quickly they speed up toward it (higher = snappier)
const BURST_MIN = 380;     // scatter speed range (px/s) when you let go
const BURST_MAX = 600;
const SETTLE = 1.5;        // how quickly they calm back to normal drift (higher = faster)

const JUMP_TIME = 0.8;   // seconds for the two jumps
const JUMP_H = 40;       // how high each jump goes (px)
const HEART_TIME = 1.4;  // how long the heart floats before fading
const PET_COOLDOWN = 2000; // ms before the same drawing can be hearted again

const FOOD_RADIUS = 180;  // px: how close the food must be to a drawing to attract it
const FOOD_SPEED = 260;   // top speed (px/s) when rushing to the food
const FOOD_EASE = 5;      // how quickly they speed up toward it

const BROOM_RADIUS = 160;  // px: how close the broom must be to scare a drawing
const BROOM_SPEED = 300;   // top speed (px/s) when fleeing
const BROOM_EASE = 6;      // how quickly they speed up away from it

let creatures = []; // every drawing on the screen
let rafId = null;
let lastTime = 0;
let touch = { active: false, mode: 'hold', x: 0, y: 0, sx: 0, sy: 0, lx: 0, ly: 0, t0: 0 };
let food = { active: false, x: 0, y: 0 }; // x, y in world coordinates
// x, y are in world coordinates. sx/sy is where the finger started and
// lx/ly is where it was last, both in screen coordinates.
let broom = { active: false, x: 0, y: 0 }; // x, y in world coordinates

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
  const p = toLayout(t.clientX, t.clientY);
  startTouch(p.x, p.y);
}, { passive: false });

touchLayer.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const p = toLayout(t.clientX, t.clientY);
  moveTouch(p.x, p.y);
}, { passive: false });

touchLayer.addEventListener('touchend', (e) => {
  if (e.touches.length === 0) endTouch();
});
touchLayer.addEventListener('touchcancel', endTouch);

// Computer: mouse events
touchLayer.addEventListener('mousedown', (e) => { const p = toLayout(e.clientX, e.clientY); startTouch(p.x, p.y); });
window.addEventListener('mousemove', (e) => { const p = toLayout(e.clientX, e.clientY); moveTouch(p.x, p.y); });
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
  const target = Math.min(layoutW(), layoutH()) * 0.3;
  const scale = target / Math.max(bw, bh);
  const cw = bw * scale;
  const ch = bh * scale;
  el.style.width = cw + 'px';
  el.style.height = ch + 'px';
  world.appendChild(el);

  // 4. Give it its own position, drift direction and waddle rhythm
  const viewBottom = buttonsTop() - 8;
  const angle = Math.random() * Math.PI * 2;
  const speed = 50 + Math.random() * 40; // its normal "cruising" speed (px/s)
  creatures.push({
    el: el,
    w: cw,
    h: ch,
    x: camX + (layoutW() - cw) / 2,
    y: camY + (viewBottom - ch) / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    cruise: speed,                      // what it settles back to after a scatter
    phase: Math.random() * Math.PI * 2, // so they don't all waddle in sync
    step: 8 + Math.random() * 3  ,       // each one has its own step speed
    jumpT: -1,            // -1 = not jumping
    lastPet: -Infinity,
    heartEl: null,
    heartT: 0,
  });

  enterFloatMode();

  // Start the animation loop if it isn't already running
  if (!rafId) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

function wipeCreatures() {
  for (const c of creatures) {
    c.el.remove();
    if (c.heartEl) c.heartEl.remove();
  }
  creatures = [];
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
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
  const bottom = worldH - (layoutH() - buttonsTop()) - 8;

  for (const c of creatures) {
    // Distance from this drawing to the food and to the broom (if being dragged)
    const fdx = food.x - (c.x + c.w / 2);
    const fdy = food.y - (c.y + c.h / 2);
    const fdist = Math.hypot(fdx, fdy) || 1;

    const bdx = (c.x + c.w / 2) - broom.x; // points away from the broom
    const bdy = (c.y + c.h / 2) - broom.y;
    const bdist = Math.hypot(bdx, bdy) || 1;

    if (food.active && fdist < FOOD_RADIUS) {
      // Food is close: rush toward it, slowing down as they arrive
      const want = Math.min(FOOD_SPEED, fdist * 2);
      const ease = Math.min(1, FOOD_EASE * dt);
      c.vx += (fdx / fdist * want - c.vx) * ease;
      c.vy += (fdy / fdist * want - c.vy) * ease;
    } else if (broom.active && bdist < BROOM_RADIUS) {
      // Broom is close: run straight away from it
      const ease = Math.min(1, BROOM_EASE * dt);
      c.vx += (bdx / bdist * BROOM_SPEED - c.vx) * ease;
      c.vy += (bdy / bdist * BROOM_SPEED - c.vy) * ease;
    } else if (touch.active && touch.mode === 'hold' && now - touch.t0 > HOLD_MS) {
      // Finger is down: steer toward it, slowing down as they get close
      const dx = touch.x - (c.x + c.w / 2);
      const dy = touch.y - (c.y + c.h / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const want = Math.min(ATTRACT_SPEED, dist * 1.5);
      const ease = Math.min(1, ATTRACT_EASE * dt);
      c.vx += (dx / dist * want - c.vx) * ease;
      c.vy += (dy / dist * want - c.vy) * ease;
    } else {
      // Finger is up: calm back down to normal drift speed, keeping the direction
      const sp = Math.hypot(c.vx, c.vy) || 1;
      const newSp = c.cruise + (sp - c.cruise) * Math.exp(-SETTLE * dt);
      c.vx *= newSp / sp;
      c.vy *= newSp / sp;
    }

    // Move
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // Bounce off the edges
    if (c.x < 0) { c.x = 0; c.vx = Math.abs(c.vx); }
    if (c.x + c.w > W) { c.x = W - c.w; c.vx = -Math.abs(c.vx); }
    if (c.y < 0) { c.y = 0; c.vy = Math.abs(c.vy); }
    if (c.y + c.h > bottom) { c.y = bottom - c.h; c.vy = -Math.abs(c.vy); }

    // Waddle faster when moving faster
    const speedNow = Math.hypot(c.vx, c.vy);
    const excite = Math.min(2.5, Math.max(1, speedNow / c.cruise));
    c.phase += dt * c.step * excite;

    const tilt = Math.sin(c.phase) * 0.22;
        // Two quick jumps when petted (the abs of one sine wave makes two humps)
    let jumpLift = 0;
    if (c.jumpT >= 0) {
      c.jumpT += dt;
      if (c.jumpT >= JUMP_TIME) c.jumpT = -1;
      else jumpLift = Math.abs(Math.sin(c.jumpT / JUMP_TIME * Math.PI * 2)) * JUMP_H;
    }
    const hop = Math.abs(Math.sin(c.phase)) * 8 + jumpLift;

    c.el.style.transform =
      `translate(${c.x}px, ${c.y - hop}px) rotate(${tilt}rad)`;

        // The heart rises above the drawing and fades out
    if (c.heartEl) {
      c.heartT += dt;
      const p = c.heartT / HEART_TIME;
      if (p >= 1) {
        c.heartEl.remove();
        c.heartEl = null;
      } else {
        c.heartEl.style.opacity = 1 - p * p;
        c.heartEl.style.transform =
          `translate(${c.x + c.w / 2}px, ${c.y - hop - 6 - p * 40}px) translate(-50%, -100%)`;
      }
    }
  }

  rafId = requestAnimationFrame(tick);
}

// ---------- Tools (drag onto a drawing) ----------

const tools = document.getElementById('tools');
let ghost = null;

tools.addEventListener('pointerdown', (e) => {
  const tool = e.target.closest('.tool');
  if (!tool || mode !== 'floating' || ghost) return;
  e.preventDefault();

  tool.setPointerCapture(e.pointerId); // keep getting events even off the button
  tool.classList.add('dragging');

  ghost = tool.cloneNode(true);
  ghost.classList.remove('dragging');
  ghost.classList.add('tool-ghost');
  document.body.appendChild(ghost);
  const p0 = toLayout(e.clientX, e.clientY);
  moveGhost(p0.x, p0.y, tool.dataset.tool);

  const onMove = (ev) => {
    const p = toLayout(ev.clientX, ev.clientY);
    moveGhost(p.x, p.y, tool.dataset.tool);
  };
  const onEnd = () => {
    food.active = false;
    broom.active = false;
    tool.removeEventListener('pointermove', onMove);
    tool.removeEventListener('pointerup', onEnd);
    tool.removeEventListener('pointercancel', onEnd);
    tool.classList.remove('dragging');
    if (ghost) ghost.remove();
    ghost = null;
  };
  tool.addEventListener('pointermove', onMove);
  tool.addEventListener('pointerup', onEnd);
  tool.addEventListener('pointercancel', onEnd);
});

function moveGhost(x, y, toolName) {
  ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;

  if (toolName === 'food') {
    food.active = true;
    food.x = x + camX;
    food.y = y + camY;
    return;
  }

    if (toolName === 'broom') {
    broom.active = true;
    broom.x = x + camX;
    broom.y = y + camY;
    return;
  }

  // Is the ghost over a drawing? (creature positions are in world coords, so shift by the camera)
  for (const c of creatures) {
    const left = c.x - camX, top = c.y - camY;
    if (x >= left && x <= left + c.w && y >= top && y <= top + c.h) {
      if (toolName === 'hand') pet(c);
    }
  }
}

function pet(c) {
  const now = performance.now();
  if (now - c.lastPet < PET_COOLDOWN) return;
  c.lastPet = now;

  c.jumpT = 0; // tick() runs the two jumps

  if (c.heartEl) c.heartEl.remove();
  c.heartEl = document.createElement('div');
  c.heartEl.className = 'heart';
  c.heartEl.textContent = 'heart'; // swap for a sprite later
  world.appendChild(c.heartEl);
  c.heartT = 0;
}

enterFloatMode(); // start straight in the playspace