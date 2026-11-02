// Shrinks a photo in the browser before it's uploaded: phone photos are often 3–12 MB, and Vercel
// refuses request bodies over 4.5 MB. Claude scales images down to about this size anyway.
const LONG_EDGE = 1568;
// Thumbnails show at about 48px; this keeps them sharp on 3x screens
const THUMBNAIL_SIZE = 160;

export async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await openPhoto(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  return draw(bitmap, width, height, (ctx) => ctx.drawImage(bitmap, 0, 0, width, height));
}

// A small square from the middle of the photo, for lists
export async function photoThumbnail(file: File): Promise<Blob> {
  const bitmap = await openPhoto(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(THUMBNAIL_SIZE, side);
  return draw(bitmap, size, size, (ctx) =>
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size));
}

// Applies the EXIF orientation, so portrait photos stay upright
function openPhoto(file: File) {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function draw(bitmap: ImageBitmap, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d")!);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Das Foto konnte nicht umgewandelt werden."))), "image/jpeg", 0.85),
  );
}
