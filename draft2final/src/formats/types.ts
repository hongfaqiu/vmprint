import type { DocumentInput } from '@vmprint/engine';
import type { SemanticDocument } from '../semantic';

export type FormatCompileOptions = {
  flavor?: string;
};

export type FormatModule = {
  name: string;
  listFlavors(): string[];
  compile(document: SemanticDocument, inputPath: string, options?: FormatCompileOptions): DocumentInput;
};
