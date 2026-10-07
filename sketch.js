const fileInput = document.getElementById('fileInput');
const takeBtn = document.getElementById('takeBtn');
const slider = document.getElementById('slider');
const sliderWrap = document.getElementById('sliderWrap');
const hint = document.getElementById('hint');
const canvas = document.getElementById('drawing');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const MAX_SIZE = 1400; // shrink big phone photos so processing stays fast
let sourceData = null; // the original photo's pixels

// Button opens the camera
takeBtn.addEventListener('click', () => fileInput.click());

// When a photo comes back from the camera
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    // Scale the photo down and draw it onto our canvas
    const scale = Math.min(1, MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    hint.style.display = 'none';
    sliderWrap.style.display = 'block';
    takeBtn.textContent = '🔄 Retake';

    removeBackground();
  };

  img.onerror = () => {
    alert('Could not load that photo, try again');
  };

  img.src = url;
  fileInput.value = ''; // lets you pick the same photo twice
});

// Re-run whenever the slider moves
slider.addEventListener('input', removeBackground);

function removeBackground() {
  if (!sourceData) return;

  const src = sourceData.data;
  const out = ctx.createImageData(sourceData.width, sourceData.height);
  const dst = out.data;
  const pixelCount = src.length / 4;

  // 1. Build a brightness histogram to find how bright the paper is.
  //    The 90th percentile is a good guess, since paper is most of the photo.
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

  // 2. Slider sets where "ink" starts. Higher = picks up fainter lines.
  const s = slider.value / 100;
  const hi = 0.70 + 0.25 * s; // brightness ratio where ink starts to appear
  const lo = hi - 0.20;       // brightness ratio where ink is fully opaque

  // 3. Darker than paper = ink (opaque), same as paper = transparent
  for (let i = 0; i < src.length; i += 4) {
    const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
    const ratio = lum / paper;
    const alpha = Math.min(1, Math.max(0, (hi - ratio) / (hi - lo)));

    dst[i] = src[i];
    dst[i + 1] = src[i + 1];
    dst[i + 2] = src[i + 2];
    dst[i + 3] = alpha * 255;
  }

  // Replaces the photo with the transparent version.
  // The pink you see behind it is the page background in the CSS.
  ctx.putImageData(out, 0, 0);
}