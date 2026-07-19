import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface BibleCorpusSource {
  readonly path: string;
  readonly label: string;
}

export interface BibleCorpusProvisionResult {
  readonly source: BibleCorpusSource;
  readonly destination: string;
  readonly copied: boolean;
  readonly bytes: number;
}

interface CorpusFingerprint {
  readonly source: string;
  readonly bytes: number;
  readonly modifiedAt: number;
}

const fingerprintPath = (destination: string): string => `${destination}.source.json`;

const firstReadableSource = async (
  sources: readonly BibleCorpusSource[],
): Promise<{ readonly source: BibleCorpusSource; readonly fingerprint: CorpusFingerprint }> => {
  const candidates = await Promise.all(
    sources.map(async (source) => {
      try {
        await access(source.path, constants.R_OK);
        const details = await stat(source.path);
        if (!details.isFile() || details.size === 0) return undefined;
        return {
          source,
          fingerprint: {
            source: path.resolve(source.path),
            bytes: details.size,
            modifiedAt: details.mtimeMs,
          },
        };
      } catch {
        return undefined;
      }
    }),
  );
  const available = candidates.find((candidate) => candidate !== undefined);
  if (available !== undefined) return available;
  throw new Error(
    `Bible corpus is unavailable. Checked: ${sources.map((source) => source.path).join(', ')}`,
  );
};

const readFingerprint = async (destination: string): Promise<CorpusFingerprint | undefined> => {
  try {
    return JSON.parse(await readFile(fingerprintPath(destination), 'utf8')) as CorpusFingerprint;
  } catch {
    return undefined;
  }
};

const fingerprintsMatch = (left: CorpusFingerprint, right: CorpusFingerprint): boolean =>
  left.source === right.source &&
  left.bytes === right.bytes &&
  left.modifiedAt === right.modifiedAt;

export const provisionBibleCorpus = async (input: {
  readonly destination: string;
  readonly sources: readonly BibleCorpusSource[];
}): Promise<BibleCorpusProvisionResult> => {
  const { source, fingerprint } = await firstReadableSource(input.sources);
  const currentFingerprint = await readFingerprint(input.destination);
  try {
    const destinationStat = await stat(input.destination);
    if (
      destinationStat.isFile() &&
      destinationStat.size === fingerprint.bytes &&
      currentFingerprint !== undefined &&
      fingerprintsMatch(currentFingerprint, fingerprint)
    ) {
      return {
        source,
        destination: input.destination,
        copied: false,
        bytes: fingerprint.bytes,
      };
    }
  } catch {
    // Missing or unreadable destinations are replaced atomically below.
  }

  await mkdir(path.dirname(input.destination), { recursive: true });
  const building = `${input.destination}.building`;
  await copyFile(source.path, building);
  await rename(building, input.destination);
  await writeFile(fingerprintPath(input.destination), JSON.stringify(fingerprint), 'utf8');
  return { source, destination: input.destination, copied: true, bytes: fingerprint.bytes };
};
