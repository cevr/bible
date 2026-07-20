export function refreshWritingsCatalogAfter<A>(
  download: Promise<A>,
  refresh: () => Promise<unknown>,
): Promise<A> {
  return download.then((result) => refresh().then(() => result));
}

export const writingsDownloadLabel = (
  action: 'Download' | 'Retry',
  title: string,
  code: string,
): string => `${action} ${title} (${code})`;
