import { drawCoinWithRoundedCorners } from "./drawCoinWithRoundedCorners";
import { drawImageWithRoundedCorners } from "./drawImageWithRoundedCorners";
import { fetchImage } from "./fetchImage";

export async function generateCommunityGenesisImage(
  image: HTMLImageElement,
  coinImage: HTMLImageElement,
): Promise<Blob> {
  const frameImage = await fetchImage(
    "https://storage.googleapis.com/mmosh-assets/genesis_pass_frame.png",
  );

  const height = image.height;
  const width = image.width;

  const canvas = document.createElement("canvas");

  canvas.height = height;
  canvas.width = width;

  const ctx = canvas.getContext("2d");

  drawImageWithRoundedCorners(canvas, ctx!, image, 0, 0, width, height, 80);

  ctx?.drawImage(frameImage, 0, 0, width, height);

  drawCoinWithRoundedCorners(ctx!, coinImage, 50, height * 0.8 - 5);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
    });
  });
}
