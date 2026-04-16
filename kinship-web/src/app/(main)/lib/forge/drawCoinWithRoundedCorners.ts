export const drawCoinWithRoundedCorners = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
) => {
  ctx.beginPath();
  ctx.arc(x + 85, y + 75, 80, 0, 2 * Math.PI);
  ctx.clip();
  ctx.stroke();

  ctx.drawImage(image, x + 5, y - 5, 160, 160);
};
