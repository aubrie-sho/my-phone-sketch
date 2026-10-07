let capture;
let processedImage = null;
let hearts = [];
let captureButton;
let retakeButton;
let isCaptured = false;

// Background removal settings
const BRIGHTNESS_THRESHOLD = 150; // Pixels brighter than this become transparent

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Open the back camera
  capture = createCapture({
    video: { facingMode: 'environment' },
    audio: false
  });
  capture.size(640, 480);
  capture.hide();

  // Capture button
  captureButton = createButton('📸 Capture');
  captureButton.position(20, 20);
  captureButton.mousePressed(captureDrawing);

  // Retake button (hidden until first capture)
  retakeButton = createButton('🔄 Retake');
  retakeButton.position(20, 60);
  retakeButton.hide();
  retakeButton.mousePressed(retakeDrawing);
}

function captureDrawing() {
  if (capture.elt.readyState < 2) return;

  let vw = capture.elt.videoWidth;
  let vh = capture.elt.videoHeight;

  let buffer = createGraphics(vw, vh);
  buffer.pixelDensity(1); // <-- the important line
  buffer.drawingContext.drawImage(capture.elt, 0, 0, vw, vh);

  processedImage = removeBackground(buffer);
  buffer.remove(); // free the offscreen canvas

  isCaptured = true;
  captureButton.hide();
  retakeButton.show();
}

function retakeDrawing() {
  isCaptured = false;
  processedImage = null;
  captureButton.show();
  retakeButton.hide();
}

function removeBackground(sourceImg) {
  sourceImg.loadPixels();
  let result = createImage(sourceImg.width, sourceImg.height);
  result.loadPixels();

  for (let i = 0; i < sourceImg.pixels.length; i += 4) {
    let r = sourceImg.pixels[i];
    let g = sourceImg.pixels[i + 1];
    let b = sourceImg.pixels[i + 2];
    let brightness = (r + g + b) / 3;

    result.pixels[i] = r;
    result.pixels[i + 1] = g;
    result.pixels[i + 2] = b;
    result.pixels[i + 3] = brightness > BRIGHTNESS_THRESHOLD ? 0 : 255;
  

  result.updatePixels();
  return result;
  }

  result.updatePixels();
  return result;
}

function draw() {
  // Pink background (will be changed later)
  background(255, 182, 193);

  if (!isCaptured) {
    // Show live camera feed using native drawImage to avoid iOS scanlines
    if (capture && capture.elt.readyState >= 2) {
      drawingContext.drawImage(capture.elt, 0, 0, width, height);
    }
  } else {
    // Show the processed image (transparent background)
    if (processedImage) {
      image(processedImage, 0, 0, width, height);
    }
  }

  // Update and draw hearts
  for (let i = hearts.length - 1; i >= 0; i--) {
    let h = hearts[i];
    h.update();
    h.display();
    if (h.isDead()) {
      hearts.splice(i, 1);
    }
  }
}

function touchStarted() {
  if (isCaptured) {
    // Spawn hearts at tap location
    for (let i = 0; i < 8; i++) {
      hearts.push(new Heart(mouseX, mouseY));
    }
  }
  return false; // prevent default browser behavior
}

class Heart {
  constructor(x, y) {
    this.x = x + random(-30, 30);
    this.y = y + random(-30, 30);
    this.size = random(15, 40);
    this.speedY = random(-4, -2);
    this.speedX = random(-1.5, 1.5);
    this.life = 255;
    this.decay = random(1.5, 3);
    this.rotation = random(-0.4, 0.4);
    this.rotSpeed = random(-0.02, 0.02);
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.life -= this.decay;
    this.speedY -= 0.03; // float upward
    this.rotation += this.rotSpeed;
  }

  display() {
    push();
    translate(this.x, this.y);
    rotate(this.rotation);
    scale(this.size / 30);
    noStroke();
    fill(255, 50, 100, this.life);

    // Heart shape
    beginShape();
    vertex(0, 10);
    bezierVertex(-15, -5, -30, 10, 0, 30);
    bezierVertex(30, 10, 15, -5, 0, 10);
    endShape(CLOSE);

    pop();
  }

  isDead() {
    return this.life <= 0;
  }
}