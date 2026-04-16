export const drawImageWithRoundedCorners = (
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  // Clear any previous drawing
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Begin defining the rounded rectangle path
  ctx.beginPath();

  // Top-left corner
  ctx.moveTo(x + radius, y);

  // Top edge
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);

  // Right edge
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);

  // Bottom edge
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);

  // Left edge
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);

  // Close the path and apply the clipping mask
  ctx.closePath();
  ctx.clip();

  // Draw the image onto the canvas
  ctx.drawImage(image, x, y, width, height);
};
