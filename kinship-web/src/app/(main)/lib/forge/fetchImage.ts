export async function fetchImage(url: string): Promise<HTMLImageElement> {
  const image = new Image(1080, 1080);

  image.crossOrigin = "anonymous";
  image.src = url;

  return new Promise((resolve, _) => {
    image.onload = (_: any) => {
      resolve(image);
    };
  });
}
