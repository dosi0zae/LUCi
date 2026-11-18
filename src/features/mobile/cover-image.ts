// A photo the author picks from the gallery or takes with the camera becomes the course's cover. There is no server to
// keep it on (every course lives in this browser's localStorage, a few MB in all), so it is shrunk first: the longest
// side to 720 px, JPEG, which comes to roughly 40-90 KB. The browser applies the photo's rotation (EXIF) when it draws it.

const MAX_SIDE_PX = 720;
const JPEG_QUALITY = 0.72;

export async function fileToCoverDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("not an image");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("the photo could not be read"));
      element.src = objectUrl;
    });

    const scale = Math.min(1, MAX_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("no canvas");
    }
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
