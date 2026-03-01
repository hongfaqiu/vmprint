import path from 'node:path';
import fs from 'node:fs';
import { LayoutEngine, Renderer, resolveDocumentPaths, toLayoutConfig, createEngineRuntime, LayoutUtils } from '@vmprint/engine';
import type { DocumentInput } from '@vmprint/engine';
import { PdfContext } from '@vmprint/context-pdf';
import { LocalFontManager } from '@vmprint/local-fonts';
import { parseMarkdownAst } from './markdown';
import { normalizeToSemantic, SemanticDocument } from './semantic';
import { getFormatModule } from './formats';
import { Draft2FinalError } from './errors';

export type BuildResult = {
  format: string;
  syntax: SemanticDocument;
  ir: DocumentInput;
};

export function compileMarkdownToVmprint(
  markdown: string,
  inputPath: string,
  formatName: string = 'markdown',
  flavorName?: string
): BuildResult {
  const ast = parseMarkdownAst(markdown, inputPath);
  const syntax = normalizeToSemantic(ast, inputPath);
  const format = getFormatModule(formatName);
  const ir = format.compile(syntax, inputPath, { flavor: flavorName });
  return { format: format.name, syntax, ir };
}

async function renderVmprintPdf(ir: DocumentInput, inputPath: string, outputPdfPath: string, debug: boolean = false): Promise<void> {
  const resolvedOutput = path.resolve(outputPdfPath);
  const outputDir = path.dirname(resolvedOutput);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Draft2FinalError('write', resolvedOutput, `Failed to prepare output directory: ${message}`, 5, { cause: error });
  }

  try {
    const documentIR = resolveDocumentPaths(ir, inputPath);
    const runtime = createEngineRuntime({ fontManager: new LocalFontManager() });
    const config = toLayoutConfig(documentIR, debug);
    const engine = new LayoutEngine(config, runtime);
    await engine.waitForFonts();
    const pages = engine.paginate(documentIR.elements);

    const { width, height } = LayoutUtils.getPageDimensions(config);
    const outputStream = fs.createWriteStream(resolvedOutput);
    const context = new PdfContext(outputStream, {
      size: [width, height],
      margins: { top: 0, left: 0, right: 0, bottom: 0 },
      autoFirstPage: false,
      bufferPages: false
    });

    const renderer = new Renderer(config, debug, runtime);
    await renderer.render(pages, context);
    await context.waitForFinish();
  } catch (error: unknown) {
    if (error instanceof Draft2FinalError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Draft2FinalError('render', resolvedOutput, `Failed to render PDF: ${message}`, 4, { cause: error });
  }

  try {
    const stat = fs.statSync(resolvedOutput);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error('Rendered PDF file was empty.');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Draft2FinalError('write', resolvedOutput, `Failed to verify output file: ${message}`, 5, { cause: error });
  }
}

export async function buildMarkdownToPdf(
  markdown: string,
  inputPath: string,
  outputPdfPath: string,
  formatName: string = 'markdown',
  flavorName?: string,
  debug: boolean = false
): Promise<BuildResult> {
  const result = compileMarkdownToVmprint(markdown, inputPath, formatName, flavorName);
  await renderVmprintPdf(result.ir, inputPath, outputPdfPath, debug);
  return result;
}
