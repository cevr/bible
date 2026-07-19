export function refreshWritingsCatalogAfter<A>(
  download: Promise<A>,
  refresh: () => Promise<unknown>,
): Promise<A> {
  return download.then(async (result) => {
    await refresh();
    return result;
  });
}

export const writingsDownloadLabel = (
  action: 'Download' | 'Retry',
  title: string,
  code: string,
): string => `${action} ${title} (${code})`;
