// The player's DOM helpers: a child the markup must have, and bytes or a
// canvas as base64.

/** The element `sel` finds under `root`: markup the caller wrote, so a missing one is a bug. */
export const required = <T extends Element>(root: ParentNode, sel: string): T => {
  const found = root.querySelector<T>(sel);
  if (found === null) throw new Error(`missing ${sel}`);
  return found;
};

/** Bytes as base64: what the export handle hands back across `page.evaluate`. */
export const bytesBase64 = (bytes: Uint8Array): string => bytes.toBase64();

/** A canvas as base64 PNG or JPEG (JPEG at quality 0.95; PNG is lossless). */
export const canvasBase64 = async (
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
): Promise<string> => {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.95));
  if (blob === null) throw new Error('toBlob failed');
  return bytesBase64(new Uint8Array(await blob.arrayBuffer()));
};
