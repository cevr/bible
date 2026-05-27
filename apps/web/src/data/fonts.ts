/** Font family display names → CSS font-family stacks. */
export const FONT_FALLBACKS: Record<string, string> = {
  'Crimson Pro': "'Crimson Pro', Georgia, serif",
  Lora: "'Lora', Georgia, serif",
  Literata: "'Literata', Georgia, serif",
  'EB Garamond': "'EB Garamond', Georgia, serif",
  'Source Sans 3': "'Source Sans 3', system-ui, sans-serif",
  Georgia: 'Georgia, serif',
};

/** Resolve a font name to its full CSS font-family value. */
export function fontFamilyValue(name: string): string {
  return FONT_FALLBACKS[name] ?? `'${name}', Georgia, serif`;
}
