function setup() {
  setUpCanvas();
}

function draw() {
  // OLD
}

function setUpCanvas() {
    createCanvas(1000, 750);
    strokeWeight(10);
    stroke(255, 105, 180); // Hot pink border
    noFill();

    // Radial gradient background - sunny yellow to sky blue
    for (let r = 625; r > 0; r -= 1) {
        let inter = map(r, 0, 625, 0, 1);
        let c = lerpColor(color(255, 235, 59), color(135, 206, 250), inter);
        fill(c);
        circle(500, 375, r * 2);
    }

    // Border rectangle
    noFill();
    stroke(255, 105, 180); // Hot pink
    rect(5, 5, 990, 740);
}