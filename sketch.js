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
let wipeOnLoad = false; // true when the next photo should clear all drawings

// ---------- Buttons ----------

// In the waddling screen this is "Start over", which wipes everything.
// While editing it is "Retake", which only replaces the current photo.
takeBtn.addEventListener('click', () => {
  wipeOnLoad = (mode === 'floating');
  fileInput.click();
});

// Adds another drawing and keeps the existing ones
addBtn.addEventListener('click', () => {
  wipeOnLoad = false;
  fileInput.click();
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

function removeBackground() {
  if (!sourceData) return;

  const src = sourceData.data;
  const out = ctx.createImageData(sourceData.width, sourceData.height);
  const dst = out.data;
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
    if (count >= pixelCount * 0.9) {
      paper = v;
      break;
    }
  }
  paper = Math.max(paper, 1);

  // Slider sets where "ink" starts. Higher = picks up fainter lines.
  const s = slider.value / 100;
  const hi = 0.70 + 0.25 * s;
  const lo = hi - 0.20;

  for (let i = 0; i < src.length; i += 4) {
    const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
    const ratio = lum / paper;
    const alpha = Math.min(1, Math.max(0, (hi - ratio) / (hi - lo)));

    dst[i] = src[i];
    dst[i + 1] = src[i + 1];
    dst[i + 2] = src[i + 2];
    dst[i + 3] = alpha * 255;
  }

  ctx.putImageData(out, 0, 0);
}
// ---------- The waddling drawings ----------

const touchLayer = document.getElementById('touchLayer');

// Tweak these to change how the touch feels
const ATTRACT_SPEED = 240; // top speed (px/s) when rushing toward your finger
const ATTRACT_EASE = 4;    // how quickly they speed up toward it (higher = snappier)
const BURST_MIN = 380;     // scatter speed range (px/s) when you let go
const BURST_MAX = 600;
const SETTLE = 1.5;        // how quickly they calm back to normal drift (higher = faster)

let creatures = []; // every drawing on the screen
let rafId = null;
let lastTime = 0;
let touch = { active: false, id: null, x: 0, y: 0 };

// ----- Touch handling -----

function startTouch(x, y) {
  if (touch.active || mode !== 'floating') return;
  touch.active = true;
  touch.x = x;
  touch.y = y;
}

function moveTouch(x, y) {
  if (touch.active) {
    touch.x = x;
    touch.y = y;
  }
}

function endTouch() {
  if (!touch.active) return;
  touch.active = false;
  scatter(touch.x, touch.y);
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
  document.body.appendChild(el);

  // 4. Give it its own position, drift direction and waddle rhythm
  const bottom = buttonsRow.getBoundingClientRect().top - 8;
  const angle = Math.random() * Math.PI * 2;
  const speed = 50 + Math.random() * 40; // its normal "cruising" speed (px/s)
  creatures.push({
    el: el,
    w: cw,
    h: ch,
    x: (window.innerWidth - cw) / 2,
    y: (bottom - ch) / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    cruise: speed,                      // what it settles back to after a scatter
    phase: Math.random() * Math.PI * 2, // so they don't all waddle in sync
    step: 8 + Math.random() * 3         // each one has its own step speed
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

// ----- The animation loop -----

function tick(now) {
  if (creatures.length === 0) {
    rafId = null;
    return;
  }

  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  const W = window.innerWidth;
  // Floor is just above the button row, so it stays put when the slider appears
  const bottom = buttonsRow.getBoundingClientRect().top - 8;

  for (const c of creatures) {
    if (touch.active) {
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
    const hop = Math.abs(Math.sin(c.phase)) * 8;

    c.el.style.transform =
      `translate(${c.x}px, ${c.y - hop}px) rotate(${tilt}rad)`;
  }

  rafId = requestAnimationFrame(tick);
}