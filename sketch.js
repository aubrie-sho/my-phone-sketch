function setup() {
  setUpCanvas();
}

function setUpCanvas() {
    createCanvas(1000, 750);
    strokeWeight(10);
    stroke(0);
    noFill();

    // Radial gradient background
    for (let r = 625; r > 0; r -= 1) {
        let inter = map(r, 0, 625, 0, 1);
        let c = lerpColor(color(255), color(128), inter);
        fill(c);
        circle(500, 375, r * 2);
    }

    // Border rectangle
    noFill();
    stroke(0);
    rect(5, 5, 990, 740);
}
