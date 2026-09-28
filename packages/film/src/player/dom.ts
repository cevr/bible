// The DOM helpers the player and the lab share: an element with its class, an
// SVG element with its attributes, a child the markup must have, a JSON write
// to the lab's API, and bytes or a canvas as base64.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An HTML element with its class and, when given, its text. */
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** An SVG element with its attributes. */
export const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

/** The element `sel` finds under `root`: markup the caller wrote, so a missing one is a bug. */
export const required = <T extends Element>(root: ParentNode, sel: string): T => {
  const found = root.querySelector<T>(sel);
  if (found === null) throw new Error(`missing ${sel}`);
  return found;
};

/**
 * POST `body` as JSON and answer the parsed JSON reply. A refusal throws with
 * the server's text (`SourceRefused: …`), which the lab shows as it is.
 */
export const postJson = async (url: string, body: unknown): Promise<unknown> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || `${url}: ${res.status}`);
  return res.json();
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
