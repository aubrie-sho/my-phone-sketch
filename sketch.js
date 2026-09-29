function setup() {
  createCanvas(400, 600);
}

function draw() {
  // Orange background
  background(255, 165, 0);
  
  // Center the squares
  rectMode(CENTER);
  noStroke();
  
  // Largest square - dark orange
  fill(255, 140, 0);
  rect(width / 2, height / 2, 300, 300);
  
  // Medium square - medium orange
  fill(255, 180, 50);
  rect(width / 2, height / 2, 200, 200);
  
  // Smallest square - light orange
  fill(255, 210, 100);
  rect(width / 2, height / 2, 100, 100);
}