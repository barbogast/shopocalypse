// Shrinks a photo in the browser before it's uploaded: phone photos are often 3–12 MB, and Vercel
// refuses request bodies over 4.5 MB. Claude scales images down to about this size anyway.
const LONG_EDGE = 1568;

export async function resizePhoto(file: File): Promise<Blob> {
  // Applies the EXIF orientation, so portrait photos stay upright
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Das Foto konnte nicht umgewandelt werden."))), "image/jpeg", 0.85),
  );
}
