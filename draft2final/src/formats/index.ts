import { Draft2FinalError } from '../errors';
import { markdownFormat } from './markdown';
import { screenplayFormat } from './screenplay';
import { FormatModule } from './types';

const modulesByName: Record<string, FormatModule> = {
  [markdownFormat.name]: markdownFormat,
  [screenplayFormat.name]: screenplayFormat
};

export function listFormats(): string[] {
  return Object.keys(modulesByName).sort();
}

export function getFormatModule(name: string): FormatModule {
  const format = modulesByName[name];
  if (format) return format;
  throw new Draft2FinalError('format', name, `Unknown format "${name}". Available formats: ${listFormats().join(', ')}`, 2);
}

export function listFormatFlavors(formatName: string): string[] {
  return getFormatModule(formatName).listFlavors();
}

export type { FormatModule } from './types';
