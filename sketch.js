const fileInput = document.getElementById('fileInput');
const takeBtn = document.getElementById('takeBtn');
const doneBtn = document.getElementById('doneBtn');
const slider = document.getElementById('slider');
const sliderWrap = document.getElementById('sliderWrap');
const hint = document.getElementById('hint');
const controls = document.getElementById('controls');
const canvas = document.getElementById('drawing');
const floater = document.getElementById('creature'); // the cropped, floating drawing
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const MAX_SIZE = 1400; // shrink big phone photos so processing stays fast
let sourceData = null; // the original photo's pixels

// ---------- Taking the photo ----------

takeBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    stopFloating(); // back to editing mode if the drawing was floating

    const scale = Math.min(1, MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    hint.style.display = 'none';
    sliderWrap.style.display = 'block';
    doneBtn.hidden = false;
    takeBtn.textContent = '🔄 Retake';

    removeBackground();
  };

  img.onerror = () => {
    alert('Could not load that photo, try again');
  };

  img.src = url;
  fileInput.value = ''; // lets you pick the same photo twice
});

slider.addEventListener('input', removeBackground);

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

// ---------- Floating the drawing ----------

let floating = false;
let rafId = null;
let lastTime = 0;
let f = {}; // floater state: position, velocity, size

doneBtn.addEventListener('click', startFloating);

function startFloating() {
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

  // 2. Crop just the drawing onto the floating canvas
  floater.width = bw;
  floater.height = bh;
  floater.getContext('2d').drawImage(canvas, minX, minY, bw, bh, 0, 0, bw, bh);

  // 3. Size it for the screen
  const target = Math.min(window.innerWidth, window.innerHeight) * 0.4;
  const scale = target / Math.max(bw, bh);
  f.w = bw * scale;
  f.h = bh * scale;
  floater.style.width = f.w + 'px';
  floater.style.height = f.h + 'px';

  // 4. Switch screens: hide the photo and the edit controls
  canvas.style.display = 'none';
  sliderWrap.style.display = 'none';
  doneBtn.hidden = true;
  floater.hidden = false;

  // 5. Start in the middle, drifting in a random direction
  const bottom = controls.getBoundingClientRect().top;
  f.x = (window.innerWidth - f.w) / 2;
  f.y = (bottom - f.h) / 2;
  const angle = Math.random() * Math.PI * 2;
  const speed = 70; // pixels per second: raise for faster floating
  f.vx = Math.cos(angle) * speed;
  f.vy = Math.sin(angle) * speed;

  floating = true;
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stopFloating() {
  floating = false;
  if (rafId) cancelAnimationFrame(rafId);
  floater.hidden = true;
  canvas.style.display = 'block';
}

let waddlePhase = 0;

function tick(now) {
  if (!floating) return;

  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  const W = window.innerWidth;
  const bottom = controls.getBoundingClientRect().top; // stay above the buttons

  // Drift
  f.x += f.vx * dt;
  f.y += f.vy * dt;

  // Bounce off the edges
  if (f.x < 0) { f.x = 0; f.vx = Math.abs(f.vx); }
  if (f.x + f.w > W) { f.x = W - f.w; f.vx = -Math.abs(f.vx); }
  if (f.y < 0) { f.y = 0; f.vy = Math.abs(f.vy); }
  if (f.y + f.h > bottom) { f.y = bottom - f.h; f.vy = -Math.abs(f.vy); }

  // Waddle: rock side to side, with a little hop on each step
  waddlePhase += dt * 20;                       // step speed
  const tilt = Math.sin(waddlePhase) * 0.22;   // how far it rocks (radians)
  const hop = Math.abs(Math.sin(waddlePhase)) * 25; // pixels lifted per step

  const flip = f.vx < 0 ? -1 : 1;
  floater.style.transform =
    `translate(${f.x}px, ${f.y - hop}px) rotate(${tilt}rad) scaleX(${flip})`;

  rafId = requestAnimationFrame(tick);
}