import fs from 'node:fs';
import path from 'node:path';
import { Command, CommanderError } from 'commander';
import { buildMarkdownToPdf, compileMarkdownToVmprint } from './build';
import { Draft2FinalError, formatDiagnostic } from './errors';
import { listFormatFlavors, listFormats } from './formats';

const program = new Command();

program
  .name('draft2final')
  .description('Convert Markdown to PDF using the vmprint layout engine.')
  .version(process.env.npm_package_version || '0.1.0')
  .exitOverride();

program
  .command('build')
  .description('Build a Markdown file into a PDF.')
  .argument('<input>', 'Input Markdown file')
  .option('-o, --output <path>', 'Output path (.pdf for PDF, .json for AST; omit to print AST to stdout)')
  .option('--format <name>', 'Document format', 'markdown')
  .option('--flavor <name>', 'Format flavor / style variant')
  .option('-d, --debug', 'Embed layout debug boxes in the output PDF', false)
  .option('--ast', 'Output the compiled document AST as JSON instead of rendering a PDF', false)
  .action(async (inputArg: string, options: { output?: string; format: string; flavor?: string; debug: boolean; ast: boolean }) => {
    const inputPath = path.resolve(inputArg);

    if (options.ast) {
      // AST-only mode: compile and emit JSON, no PDF rendering
      let markdown: string;
      try {
        markdown = fs.readFileSync(inputPath, 'utf-8');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const err = new Draft2FinalError('parse', inputPath, `Failed to read input file: ${message}`, 3, { cause: error });
        process.stderr.write(`${formatDiagnostic(err)}\n`);
        process.exitCode = 3;
        return;
      }

      try {
        const result = compileMarkdownToVmprint(markdown, inputPath, options.format, options.flavor);
        const json = JSON.stringify(result.ir, null, 2);

        if (options.output) {
          const outputPath = path.resolve(options.output);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, json, 'utf-8');
          process.stderr.write(`[draft2final] Wrote AST JSON to ${outputPath}\n`);
        } else {
          process.stdout.write(json + '\n');
        }
        process.exitCode = 0;
      } catch (error: unknown) {
        if (error instanceof Draft2FinalError) {
          if (error.message.startsWith('Unknown format')) {
            process.stderr.write(`[draft2final] available formats: ${listFormats().join(', ')}\n`);
          } else if (error.message.startsWith('Unknown flavor')) {
            const available = listFormatFlavors(options.format);
            process.stderr.write(`[draft2final] available flavors for "${options.format}": ${available.join(', ')}\n`);
          }
          process.stderr.write(`${formatDiagnostic(error)}\n`);
          process.exitCode = error.exitCode;
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        const wrapped = new Draft2FinalError('cli', 'unknown', message, 1, { cause: error });
        process.stderr.write(`${formatDiagnostic(wrapped)}\n`);
        process.exitCode = 1;
      }
      return;
    }

    // PDF mode: -o is required and must end in .pdf
    const outputPath = options.output;
    if (!outputPath) {
      process.stderr.write(`[draft2final] -o/--output is required when not using --ast\n`);
      process.exitCode = 2;
      return;
    }

    if (path.extname(outputPath).toLowerCase() !== '.pdf') {
      process.stderr.write(`[draft2final] Output path must end with .pdf\n`);
      process.exitCode = 2;
      return;
    }

    let markdown: string;
    try {
      markdown = fs.readFileSync(inputPath, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const err = new Draft2FinalError('parse', inputPath, `Failed to read input file: ${message}`, 3, { cause: error });
      process.stderr.write(`${formatDiagnostic(err)}\n`);
      process.exitCode = 3;
      return;
    }

    try {
      await buildMarkdownToPdf(markdown, inputPath, outputPath, options.format, options.flavor, options.debug);
      process.stdout.write(`[draft2final] Wrote PDF ${path.resolve(outputPath)}\n`);
      process.exitCode = 0;
    } catch (error: unknown) {
      if (error instanceof Draft2FinalError) {
        if (error.message.startsWith('Unknown format')) {
          process.stderr.write(`[draft2final] available formats: ${listFormats().join(', ')}\n`);
        } else if (error.message.startsWith('Unknown flavor')) {
          const available = listFormatFlavors(options.format);
          process.stderr.write(`[draft2final] available flavors for "${options.format}": ${available.join(', ')}\n`);
        }
        process.stderr.write(`${formatDiagnostic(error)}\n`);
        process.exitCode = error.exitCode;
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const wrapped = new Draft2FinalError('cli', 'unknown', message, 1, { cause: error });
      process.stderr.write(`${formatDiagnostic(wrapped)}\n`);
      process.exitCode = 1;
    }
  });

async function run(): Promise<void> {
  try {
    await program.parseAsync();
  } catch (err) {
    if (err instanceof CommanderError) {
      if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
        process.exitCode = 0;
      } else {
        process.exitCode = 2;
      }
    } else {
      throw err;
    }
  }
}

void run();
