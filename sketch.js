function setup() {
  setUpCanvas();
}

function draw() {
  // OLD
}

function setUpCanvas() {
    createCanvas(1000, 750);
    
    // Bright background
    background(255, 235, 59); // yellow
    
    // Hot pink border
    strokeWeight(10);
    stroke(255, 105, 180); // Hot pink
    noFill();
    rect(5, 5, 990, 740);
    
    // Add a fun sun in the center
    noStroke();
    fill(255, 165, 0); // Orange
    circle(500, 375, 200);
    
    // Sun rays
    stroke(255, 200, 0);
    strokeWeight(4);
    for (let i = 0; i < 12; i++) {
        let angle = (TWO_PI / 12) * i;
        let x1 = 500 + cos(angle) * 120;
        let y1 = 375 + sin(angle) * 120;
        let x2 = 500 + cos(angle) * 160;
        let y2 = 375 + sin(angle) * 160;
        line(x1, y1, x2, y2);
    }
}