import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { Draft2FinalError } from '../errors';

function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function resolveFlavorPath(formatName: string, flavorName: string): string | null {
  const fileName = `${flavorName}.yaml`;
  const localDistPath = path.resolve(__dirname, formatName, 'flavors', fileName);
  if (fs.existsSync(localDistPath)) return localDistPath;

  const localSrcPath = path.resolve(__dirname, '..', 'formats', formatName, 'flavors', fileName);
  if (fs.existsSync(localSrcPath)) return localSrcPath;

  const cwdSrcPath = path.resolve(process.cwd(), 'src', 'formats', formatName, 'flavors', fileName);
  if (fs.existsSync(cwdSrcPath)) return cwdSrcPath;

  return null;
}

function resolveFlavorDir(formatName: string): string | null {
  const candidates = [
    path.resolve(__dirname, formatName, 'flavors'),
    path.resolve(__dirname, '..', 'formats', formatName, 'flavors'),
    path.resolve(process.cwd(), 'src', 'formats', formatName, 'flavors')
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }

  return null;
}

export function listFlavorNames(formatName: string): string[] {
  const dir = resolveFlavorDir(formatName);
  if (!dir) return [];

  return fs.readdirSync(dir)
    .filter((entry) => entry.toLowerCase().endsWith('.yaml'))
    .map((entry) => entry.slice(0, -'.yaml'.length))
    .sort();
}

export function loadFormatFlavor<T extends Record<string, unknown>>(formatName: string, flavorName?: string): T {
  const desired = (flavorName || 'default').trim() || 'default';
  const flavorPath = resolveFlavorPath(formatName, desired);
  if (!flavorPath) {
    const available = listFlavorNames(formatName);
    throw new Draft2FinalError(
      'format',
      `${formatName}:${desired}`,
      `Unknown flavor "${desired}" for format "${formatName}". Available flavors: ${available.join(', ') || '(none)'}`,
      2
    );
  }

  const raw = tryReadFile(flavorPath);
  if (raw === null) {
    throw new Draft2FinalError('format', flavorPath, `Failed to read flavor file "${flavorPath}"`, 2);
  }

  try {
    const parsed = parseYaml(raw) as T;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Flavor file must parse to an object');
    }
    return parsed;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Draft2FinalError('format', flavorPath, `Invalid flavor YAML: ${message}`, 2, { cause: error });
  }
}

