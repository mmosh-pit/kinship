import { drawImageWithRoundedCorners } from "./drawImageWithRoundedCorners";
import { fetchImage } from "./fetchImage";

export async function generateGroupCommunityPass(image: string): Promise<Blob> {
  const frameImage = await fetchImage(
    "https://storage.googleapis.com/mmosh-assets/community_group_layer.png",
  );

  const canvas = document.createElement("canvas");

  const height = 1080;
  const width = 1080;

  canvas.height = height;
  canvas.width = width;

  const ctx = canvas.getContext("2d");

  const coinImage = await fetchImage(image);

  drawImageWithRoundedCorners(canvas, ctx!, coinImage, 0, 0, width, height, 80);

  ctx?.drawImage(frameImage, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
    });
  });
}
