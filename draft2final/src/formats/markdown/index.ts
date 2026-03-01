import fs from 'node:fs';
import path from 'node:path';
import type { DocumentInput, Element, ElementStyle } from '@vmprint/engine';
import { SemanticDocument, SemanticNode } from '../../semantic';
import { Draft2FinalError } from '../../errors';
import { FormatModule } from '../types';
import { loadFormatFlavor, listFlavorNames } from '../flavor-loader';

type MarkdownRoleMap = {
  h1: string;
  subheading: string;
  h2: string;
  h3: string;
  h4: string;
  h5: string;
  h6: string;
  p: string;
  ul: string;
  ol: string;
  liContinuation: string;
  code: string;
  blockquote: string;
  blockquoteAttribution: string;
  hr: string;
  inlineCode: string;
  link: string;
  citationMarker: string;
  referencesHeading: string;
  referencesItem: string;
  definitionTerm: string;
  definitionDesc: string;
};

type OrderedMarkerStyle =
  | 'decimal'
  | 'lower-alpha'
  | 'upper-alpha'
  | 'lower-roman'
  | 'upper-roman'
  | 'legal';

type MarkdownFlavor = {
  typography?: {
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
    color?: string;
  };
  layout?: Partial<DocumentInput['layout']>;
  list?: {
    textIndentPerLevel?: number;
    markerGap?: number;
    itemSpacingAfter?: number;
    tightItemSpacingAfter?: number;
    unorderedMarkers?: string[];
    orderedMarkers?: OrderedMarkerStyle[];
    continuationIndentLevels?: number;
    taskMarkers?: {
      checked?: string;
      unchecked?: string;
    };
  };
  links?: {
    mode?: 'citation' | 'inline' | 'footnote';
    dedupe?: boolean;
    citationStyle?: 'bracket' | 'paren';
  };
  codeBlocks?: {
    defaultMode?: string;
    languageModes?: Record<string, string>;
    modes?: Record<string, { style?: ElementStyle }>;
  };
  references?: {
    enabled?: boolean;
    heading?: string;
    numberingStyle?: 'decimal' | 'lower-roman' | 'upper-roman';
    includeLinkTitle?: boolean;
  };
  title?: {
    subheading?: {
      enabled?: boolean;
      markerPattern?: string;
      requireMarker?: boolean;
      stripMarker?: boolean;
      applyToFirstH1Only?: boolean;
      keepWithNext?: boolean;
    };
  };
  blockquote?: {
    attribution?: {
      enabled?: boolean;
      markerPattern?: string;
    };
  };
  images?: {
    inlineStyle?: ElementStyle;
    blockStyle?: ElementStyle;
    frame?: {
      mode?: 'off' | 'all' | 'opt-in';
      markerPattern?: string;
      style?: ElementStyle;
    };
  };
  captions?: {
    pattern?: string;
    style?: ElementStyle;
    blockquoteUnderImageAsFigureCaption?: boolean;
    blockquoteStyle?: ElementStyle;
  };
  tables?: {
    zebra?: boolean;
    zebraColor?: string;
    headerColor?: string;
  };
  styles?: Record<string, ElementStyle>;
};

const roles: MarkdownRoleMap = {
  h1: 'd2f_heading_1',
  subheading: 'd2f_subheading',
  h2: 'd2f_heading_2',
  h3: 'd2f_heading_3',
  h4: 'd2f_heading_4',
  h5: 'd2f_heading_5',
  h6: 'd2f_heading_6',
  p: 'd2f_paragraph',
  ul: 'd2f_list_item_unordered',
  ol: 'd2f_list_item_ordered',
  liContinuation: 'd2f_list_item_continuation',
  code: 'd2f_code_block',
  blockquote: 'd2f_blockquote',
  blockquoteAttribution: 'd2f_blockquote_attribution',
  hr: 'd2f_thematic_break',
  inlineCode: 'd2f_inline_code',
  link: 'd2f_link',
  citationMarker: 'd2f_citation_marker',
  referencesHeading: 'd2f_references_heading',
  referencesItem: 'd2f_references_item',
  definitionTerm: 'd2f_definition_term',
  definitionDesc: 'd2f_definition_desc'
};

const INLINE_CONTAINER_TYPE = 'inline';

type ListMetrics = {
  textIndentPerLevel: number;
  markerGap: number;
  itemSpacingAfter: number;
  tightItemSpacingAfter: number;
  continuationIndentLevels: number;
  orderedMarkers: OrderedMarkerStyle[];
  taskMarkers: {
    checked: string;
    unchecked: string;
  };
};

type TableStyleConfig = {
  zebra: boolean;
  zebraColor: string;
  headerColor?: string;
};

type ImageFrameConfig = {
  mode: 'off' | 'all' | 'opt-in';
  markerPattern: RegExp;
  style: Record<string, unknown>;
};

type CaptionConfig = {
  pattern: RegExp;
  style: Record<string, unknown>;
  blockquoteStyle: Record<string, unknown>;
  blockquoteUnderImageAsFigureCaption: boolean;
};

type TitleSubheadingConfig = {
  enabled: boolean;
  markerPattern: RegExp;
  requireMarker: boolean;
  stripMarker: boolean;
  applyToFirstH1Only: boolean;
  keepWithNext: boolean;
};

function resolveBaseStyle(flavor: MarkdownFlavor): ElementStyle {
  return {
    fontFamily: flavor.typography?.fontFamily || 'Caladea',
    fontSize: flavor.typography?.fontSize ?? 11.4,
    lineHeight: flavor.typography?.lineHeight ?? 1.52,
    color: flavor.typography?.color || '#141414'
  };
}

function resolveListMetrics(flavor: MarkdownFlavor): ListMetrics {
  return {
    textIndentPerLevel: flavor.list?.textIndentPerLevel ?? 17.5,
    markerGap: flavor.list?.markerGap ?? 5,
    itemSpacingAfter: flavor.list?.itemSpacingAfter ?? 3.4,
    tightItemSpacingAfter: flavor.list?.tightItemSpacingAfter ?? 0.8,
    continuationIndentLevels: flavor.list?.continuationIndentLevels ?? 1,
    orderedMarkers: (flavor.list?.orderedMarkers && flavor.list.orderedMarkers.length > 0)
      ? flavor.list.orderedMarkers
      : ['decimal', 'lower-alpha', 'lower-roman'],
    taskMarkers: {
      checked: flavor.list?.taskMarkers?.checked || '[x]',
      unchecked: flavor.list?.taskMarkers?.unchecked || '[ ]'
    }
  };
}

function createStyles(flavor: MarkdownFlavor): Record<string, ElementStyle> {
  const baseStyle = resolveBaseStyle(flavor);
  const listMetrics = resolveListMetrics(flavor);
  const styles: Record<string, ElementStyle> = {
    text: { ...baseStyle },
    [roles.h1]: { ...baseStyle, fontSize: 23.5, fontWeight: 700, lineHeight: 1.26, marginTop: 20, marginBottom: 8, keepWithNext: true },
    [roles.subheading]: { ...baseStyle, fontSize: 11.2, lineHeight: 1.45, color: '#4b5563', textAlign: 'center', marginTop: -1, marginBottom: 14, keepWithNext: true },
    [roles.h2]: { ...baseStyle, fontSize: 18.5, fontWeight: 700, lineHeight: 1.3, marginTop: 18, marginBottom: 7, keepWithNext: true },
    [roles.h3]: { ...baseStyle, fontSize: 15.8, fontWeight: 700, lineHeight: 1.32, marginTop: 16, marginBottom: 6, keepWithNext: true },
    [roles.h4]: { ...baseStyle, fontSize: 14, fontWeight: 700, lineHeight: 1.34, marginTop: 14, marginBottom: 5, keepWithNext: true },
    [roles.h5]: { ...baseStyle, fontSize: 12.6, fontWeight: 700, lineHeight: 1.35, marginTop: 12, marginBottom: 4.2, keepWithNext: true },
    [roles.h6]: { ...baseStyle, fontSize: 11.8, fontWeight: 700, lineHeight: 1.35, marginTop: 10, marginBottom: 3.6, keepWithNext: true },
    [roles.p]: { ...baseStyle, textAlign: 'justify', hyphenation: 'auto', justifyEngine: 'advanced', justifyStrategy: 'auto', allowLineSplit: true, orphans: 2, widows: 2, marginTop: 0, marginBottom: 8.8 },
    [roles.inlineCode]: { ...baseStyle, fontFamily: 'Cousine', fontSize: 10.1, backgroundColor: '#ffffff', borderRadius: 0 },
    [roles.code]: {
      ...baseStyle,
      fontFamily: 'Cousine',
      fontSize: 10.2,
      lineHeight: 1.35,
      color: '#1f1f1f',
      backgroundColor: '#ffffff',
      allowLineSplit: false,
      overflowPolicy: 'move-whole',
      paddingTop: 7,
      paddingBottom: 7,
      paddingLeft: 9,
      paddingRight: 9,
      borderWidth: 0,
      borderRadius: 0,
      marginTop: 8.2,
      marginBottom: 10.2
    },
    [roles.blockquote]: {
      ...baseStyle,
      textAlign: 'justify',
      hyphenation: 'auto',
      justifyEngine: 'advanced',
      paddingLeft: 12,
      color: '#2f2f2f',
      marginTop: 7,
      marginBottom: 9
    },
    [roles.blockquoteAttribution]: {
      ...baseStyle,
      textAlign: 'right',
      fontStyle: 'italic',
      color: '#4a4a4a',
      marginTop: 2,
      marginBottom: 7
    },
    [roles.hr]: {
      ...baseStyle,
      lineHeight: 1,
      borderTopWidth: 0.7,
      borderTopColor: '#000000',
      marginTop: 14,
      marginBottom: 14
    },
    [roles.link]: { color: '#0f4aa5' },
    [roles.citationMarker]: { ...baseStyle, fontSize: 8.6, color: '#454545' },
    [roles.referencesHeading]: { ...baseStyle, fontSize: 14.2, fontWeight: 700, marginTop: 19, marginBottom: 6.5, keepWithNext: true },
    [roles.referencesItem]: { ...baseStyle, textAlign: 'left', hyphenation: 'auto', justifyEngine: 'advanced', marginTop: 0, marginBottom: 4.8 },
    [roles.definitionTerm]: { ...baseStyle, fontWeight: 700, marginTop: 6, marginBottom: 1.6 },
    [roles.definitionDesc]: { ...baseStyle, textAlign: 'justify', hyphenation: 'auto', justifyEngine: 'advanced', paddingLeft: 14, marginTop: 0, marginBottom: 6.2 },
    [roles.liContinuation]: { ...baseStyle, textAlign: 'justify', hyphenation: 'auto', justifyEngine: 'advanced', allowLineSplit: true, orphans: 2, widows: 2, marginTop: 3.8, marginBottom: 6.2 }
  };

  for (let depth = 0; depth <= 5; depth += 1) {
    styles[`${roles.ul}_${depth}`] = {
      ...baseStyle,
      textAlign: 'justify',
      hyphenation: 'auto',
      justifyEngine: 'advanced',
      allowLineSplit: true,
      orphans: 2,
      widows: 2,
      marginBottom: listMetrics.itemSpacingAfter,
      textIndent: listMetrics.textIndentPerLevel * depth
    };
    styles[`${roles.ol}_${depth}`] = {
      ...styles[`${roles.ul}_${depth}`]
    };
    styles[`${roles.liContinuation}_${depth}`] = {
      ...styles[roles.liContinuation],
      textIndent: listMetrics.textIndentPerLevel * (depth + listMetrics.continuationIndentLevels)
    };
  }

  const paragraphStyle = styles[roles.p] || {};
  styles.table = {
    marginTop: paragraphStyle.marginTop ?? 0,
    marginBottom: paragraphStyle.marginBottom ?? 8.8
  };
  styles['table-cell'] = {
    ...baseStyle,
    textAlign: 'left',
    hyphenation: 'off'
  };

  if (flavor.styles) {
    for (const [key, value] of Object.entries(flavor.styles)) {
      styles[key] = { ...(styles[key] || {}), ...value };
    }
  }

  return styles;
}

function resolveCodeBlockStyleOverride(
  flavor: MarkdownFlavor,
  language?: string
): Record<string, unknown> | undefined {
  const cfg = flavor.codeBlocks;
  if (!cfg || !cfg.modes) return undefined;

  const defaultMode = (cfg.defaultMode || 'default').trim();
  const langKey = (language || '').trim().toLowerCase();
  const mappedMode = langKey ? cfg.languageModes?.[langKey] : undefined;
  const modeName = (mappedMode || defaultMode).trim();
  const style = cfg.modes[modeName]?.style;

  if (!style || typeof style !== 'object') return undefined;
  return style as Record<string, unknown>;
}

function resolveInlineImageStyle(flavor: MarkdownFlavor): Record<string, unknown> {
  return {
    width: 11,
    height: 11,
    verticalAlign: 'middle',
    baselineShift: -0.8,
    inlineMarginLeft: 1.2,
    inlineMarginRight: 1.2,
    ...(flavor.images?.inlineStyle || {})
  };
}

function resolveBlockImageStyle(flavor: MarkdownFlavor): Record<string, unknown> {
  return {
    marginTop: 6,
    marginBottom: 8,
    ...(flavor.images?.blockStyle || {})
  };
}

function resolveCaptionPattern(flavor: MarkdownFlavor): RegExp {
  return new RegExp(
    flavor.captions?.pattern || '^(Figure|Fig\\.|Plate|Table|Source)\\s+([0-9]+|[IVXLC]+)\\b',
    'i'
  );
}

function resolveCaptionStyle(flavor: MarkdownFlavor): Record<string, unknown> {
  const base = resolveBaseStyle(flavor);
  return {
    textAlign: 'left',
    hyphenation: 'off',
    fontSize: Math.max(9.2, Number(base.fontSize || 11.4) * 0.9),
    lineHeight: 1.32,
    color: '#333333',
    marginTop: 2,
    marginBottom: 10,
    ...(flavor.captions?.style || {})
  };
}

function resolveCaptionConfig(flavor: MarkdownFlavor): CaptionConfig {
  const baseStyle = resolveCaptionStyle(flavor);
  return {
    pattern: resolveCaptionPattern(flavor),
    style: baseStyle,
    blockquoteStyle: {
      ...baseStyle,
      ...(flavor.captions?.blockquoteStyle || {})
    },
    blockquoteUnderImageAsFigureCaption: flavor.captions?.blockquoteUnderImageAsFigureCaption === true
  };
}

function resolveImageFrameConfig(flavor: MarkdownFlavor): ImageFrameConfig {
  const rawMode = flavor.images?.frame?.mode || 'off';
  const mode: ImageFrameConfig['mode'] = rawMode === 'all' || rawMode === 'opt-in' ? rawMode : 'off';
  return {
    mode,
    markerPattern: new RegExp(flavor.images?.frame?.markerPattern || '\\b(frame|framed)\\b', 'i'),
    style: {
      borderWidth: 0.8,
      borderColor: '#d4dce6',
      borderRadius: 2,
      paddingTop: 4,
      paddingRight: 4,
      paddingBottom: 4,
      paddingLeft: 4,
      backgroundColor: '#ffffff',
      ...(flavor.images?.frame?.style || {})
    }
  };
}

function resolveTitleSubheadingConfig(flavor: MarkdownFlavor): TitleSubheadingConfig {
  return {
    enabled: flavor.title?.subheading?.enabled === true,
    markerPattern: new RegExp(flavor.title?.subheading?.markerPattern || '^::\\s+'),
    requireMarker: flavor.title?.subheading?.requireMarker !== false,
    stripMarker: flavor.title?.subheading?.stripMarker !== false,
    applyToFirstH1Only: flavor.title?.subheading?.applyToFirstH1Only !== false,
    keepWithNext: flavor.title?.subheading?.keepWithNext !== false
  };
}

type ReferenceEntry = {
  index: number;
  url: string;
  title?: string;
};

type ReferenceRegistry = {
  byUrl: Map<string, number>;
  entries: ReferenceEntry[];
};

type ResolvedImage = {
  data: string;
  mimeType: 'image/png' | 'image/jpeg';
};

function createReferenceRegistry(): ReferenceRegistry {
  return { byUrl: new Map<string, number>(), entries: [] };
}

function registerReference(url: string, title: string | undefined, registry: ReferenceRegistry, dedupe: boolean): number {
  const normalized = (url || '').trim();
  if (normalized.length === 0) return 0;

  if (dedupe) {
    const existing = registry.byUrl.get(normalized);
    if (existing !== undefined) return existing;
  }

  const index = registry.entries.length + 1;
  registry.byUrl.set(normalized, index);
  registry.entries.push({ index, url: normalized, title });
  return index;
}

function imageSourceForError(inputPath: string, node: SemanticNode): string {
  const range = node.sourceRange;
  if (!range) return inputPath;
  return `${inputPath}:${range.lineStart}:${range.colStart}`;
}

function failImageCompile(inputPath: string, node: SemanticNode, message: string, cause?: unknown): never {
  throw new Draft2FinalError('format', imageSourceForError(inputPath, node), message, 3, cause ? { cause } : undefined);
}

function inferMimeTypeFromBytes(bytes: Buffer): 'image/png' | 'image/jpeg' | null {
  if (bytes.length >= 8) {
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    let isPng = true;
    for (let i = 0; i < pngSignature.length; i += 1) {
      if (bytes[i] !== pngSignature[i]) {
        isPng = false;
        break;
      }
    }
    if (isPng) return 'image/png';
  }

  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
    return 'image/jpeg';
  }

  return null;
}

function normalizeDataUriMimeType(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function resolveDataUriImage(rawSrc: string, inputPath: string, node: SemanticNode): ResolvedImage {
  const match = rawSrc.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    failImageCompile(
      inputPath,
      node,
      'Invalid image data URI. Expected: data:<mime>;base64,<data>.'
    );
  }

  const mimeTypeRaw = normalizeDataUriMimeType(match[1]);
  const base64Data = match[2].replace(/\s+/g, '');
  const bytes = Buffer.from(base64Data, 'base64');
  const inferredMime = inferMimeTypeFromBytes(bytes);

  if (mimeTypeRaw !== 'image/png' && mimeTypeRaw !== 'image/jpeg') {
    failImageCompile(
      inputPath,
      node,
      `Unsupported image MIME type "${mimeTypeRaw}". Supported types: image/png, image/jpeg.`
    );
  }

  if (!inferredMime) {
    failImageCompile(inputPath, node, 'Image data URI is not a valid PNG or JPEG payload.');
  }

  if (inferredMime !== mimeTypeRaw) {
    failImageCompile(
      inputPath,
      node,
      `Image data URI MIME type "${mimeTypeRaw}" does not match decoded bytes ("${inferredMime}").`
    );
  }

  return { data: base64Data, mimeType: mimeTypeRaw };
}

function resolveLocalImage(rawSrc: string, inputPath: string, node: SemanticNode): ResolvedImage {
  const markdownDir = path.dirname(path.resolve(inputPath));
  const candidatePath = path.isAbsolute(rawSrc) ? rawSrc : path.resolve(markdownDir, rawSrc);
  const decodedCandidatePath = candidatePath.includes('%')
    ? (() => {
        try {
          return decodeURIComponent(candidatePath);
        } catch {
          return candidatePath;
        }
      })()
    : candidatePath;
  const filePath = fs.existsSync(candidatePath) ? candidatePath : decodedCandidatePath;

  if (!fs.existsSync(filePath)) {
    failImageCompile(inputPath, node, `Image file not found: ${filePath}`);
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    failImageCompile(inputPath, node, `Failed to read image file "${filePath}": ${message}`, error);
  }

  const inferredMime = inferMimeTypeFromBytes(bytes);
  if (!inferredMime) {
    failImageCompile(
      inputPath,
      node,
      `Unsupported image file "${filePath}". Only PNG and JPEG are supported.`
    );
  }

  return { data: bytes.toString('base64'), mimeType: inferredMime };
}

function createImageResolver(inputPath: string): (node: SemanticNode) => ResolvedImage {
  const cache = new Map<string, ResolvedImage>();
  return (node: SemanticNode): ResolvedImage => {
    const src = (node.src || '').trim();
    if (!src) {
      failImageCompile(inputPath, node, 'Image source is empty.');
    }

    const cacheKey = src;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (/^https?:\/\//i.test(src)) {
      failImageCompile(inputPath, node, `Remote HTTP/HTTPS images are not supported: ${src}`);
    }

    const resolved = /^data:/i.test(src)
      ? resolveDataUriImage(src, inputPath, node)
      : resolveLocalImage(src, inputPath, node);
    cache.set(cacheKey, resolved);
    return resolved;
  };
}

function toAlpha(value: number, upper: boolean): string {
  let n = Math.max(1, Math.floor(value));
  let out = '';
  while (n > 0) {
    n -= 1;
    const charCode = (n % 26) + 97;
    out = String.fromCharCode(charCode) + out;
    n = Math.floor(n / 26);
  }
  return upper ? out.toUpperCase() : out;
}

function toRoman(value: number, upper: boolean): string {
  let n = Math.max(1, Math.floor(value));
  const numerals: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
  ];
  let out = '';
  for (const [unit, token] of numerals) {
    while (n >= unit) {
      out += token;
      n -= unit;
    }
  }
  return upper ? out.toUpperCase() : out;
}

function formatOrderedMarker(style: OrderedMarkerStyle, value: number, legalPath: number[]): string {
  switch (style) {
    case 'lower-alpha':
      return `${toAlpha(value, false)}.`;
    case 'upper-alpha':
      return `${toAlpha(value, true)}.`;
    case 'lower-roman':
      return `${toRoman(value, false)}.`;
    case 'upper-roman':
      return `${toRoman(value, true)}.`;
    case 'legal':
      return `${[...legalPath, value].join('.')}.`;
    case 'decimal':
    default:
      return `${value}.`;
  }
}

function formatCitationMarker(index: number, style: 'bracket' | 'paren'): string {
  return style === 'paren' ? `(${index})` : `[${index}]`;
}

function isBlockquoteAttributionParagraph(node: SemanticNode, markerPattern: RegExp): boolean {
  if (node.kind !== 'p') return false;
  const text = (node.children || [])
    .filter((child) => child.kind === 'text' || child.kind === 'inlineCode')
    .map((child) => child.value || '')
    .join('')
    .trim();
  return markerPattern.test(text);
}

function stripBlockquoteAttributionMarker(nodes: SemanticNode[], markerPattern: RegExp): SemanticNode[] {
  let stripped = false;
  const out: SemanticNode[] = [];
  for (const node of nodes) {
    if (!stripped && node.kind === 'text') {
      const nextValue = (node.value || '').replace(markerPattern, '');
      out.push({ ...node, value: nextValue });
      stripped = true;
      continue;
    }
    out.push(node);
  }
  return out;
}

function stripLeadingMarker(nodes: SemanticNode[], markerPattern: RegExp): SemanticNode[] {
  let stripped = false;
  const out: SemanticNode[] = [];
  for (const node of nodes) {
    if (!stripped && node.kind === 'text') {
      const value = node.value || '';
      const nextValue = value.replace(markerPattern, '');
      if (nextValue !== value) {
        out.push({ ...node, value: nextValue });
        stripped = true;
        continue;
      }
    }
    out.push(node);
  }
  return out;
}

function formatReferenceNumber(index: number, style: 'decimal' | 'lower-roman' | 'upper-roman'): string {
  if (style === 'lower-roman') return toRoman(index, false);
  if (style === 'upper-roman') return toRoman(index, true);
  return String(index);
}

function inlineToElements(
  nodes: SemanticNode[],
  registry: ReferenceRegistry,
  stylesByRole: Record<string, ElementStyle>,
  inlineImageStyle: Record<string, unknown>,
  resolveImage: (node: SemanticNode) => ResolvedImage,
  linkMode: 'citation' | 'inline',
  linkOptions: {
    citationStyle: 'bracket' | 'paren';
    dedupe: boolean;
  }
): Element[] {
  const result: Element[] = [];

  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        result.push({ type: 'text', content: node.value || '' });
        break;
      case 'inlineCode':
        result.push({
          type: 'text',
          content: node.value || '',
          properties: { style: { ...(stylesByRole[roles.inlineCode] as Record<string, unknown>) } }
        });
        break;
      case 'em':
        result.push({
          type: INLINE_CONTAINER_TYPE,
          content: '',
          properties: { style: { fontStyle: 'italic' } },
          children: inlineToElements(node.children || [], registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions)
        });
        break;
      case 'strong':
        result.push({
          type: INLINE_CONTAINER_TYPE,
          content: '',
          properties: { style: { fontWeight: 700 } },
          children: inlineToElements(node.children || [], registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions)
        });
        break;
      case 'link':
        if (linkMode === 'inline') {
          result.push({
            type: INLINE_CONTAINER_TYPE,
            content: '',
            properties: {
              style: { ...(stylesByRole[roles.link] as Record<string, unknown>) },
              linkTarget: (node.url || '').trim()
            },
            children: inlineToElements(node.children || [], registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions)
          });
          break;
        }

        result.push(...inlineToElements(node.children || [], registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions));
        {
          const citationIndex = registerReference(node.url || '', node.title, registry, linkOptions.dedupe);
          if (citationIndex > 0) {
            result.push({
              type: 'text',
              content: formatCitationMarker(citationIndex, linkOptions.citationStyle),
              properties: { style: { ...(stylesByRole[roles.citationMarker] as Record<string, unknown>) } }
            });
          }
        }
        break;
      case 'image': {
        const resolvedImage = resolveImage(node);
        result.push({
          type: 'image',
          content: '',
          properties: {
            style: { ...inlineImageStyle },
            image: {
              data: resolvedImage.data,
              mimeType: resolvedImage.mimeType,
              fit: 'contain'
            },
            sourceRange: node.sourceRange,
            sourceSyntax: node.sourceSyntax
          }
        });
        break;
      }
      default:
        break;
    }
  }

  return result;
}

function paragraphElement(
  type: string,
  paragraph: SemanticNode,
  registry: ReferenceRegistry,
  stylesByRole: Record<string, ElementStyle>,
  inlineImageStyle: Record<string, unknown>,
  resolveImage: (node: SemanticNode) => ResolvedImage,
  linkMode: 'citation' | 'inline',
  linkOptions: {
    citationStyle: 'bracket' | 'paren';
    dedupe: boolean;
  }
): Element {
  return {
    type,
    content: '',
    children: inlineToElements(paragraph.children || [], registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions),
    properties: {
      sourceRange: paragraph.sourceRange,
      sourceSyntax: paragraph.sourceSyntax
    }
  };
}

function inlinePlainText(nodes: SemanticNode[]): string {
  let out = '';
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
      case 'inlineCode':
        out += node.value || '';
        break;
      case 'em':
      case 'strong':
      case 'link':
        out += inlinePlainText(node.children || []);
        break;
      case 'image':
        out += node.alt || '';
        break;
      default:
        break;
    }
  }
  return out;
}

function resolveTableCellAlignment(
  alignments: Array<'left' | 'right' | 'center' | null> | undefined,
  columnIndex: number
): ElementStyle['textAlign'] | undefined {
  if (!alignments || columnIndex < 0 || columnIndex >= alignments.length) return undefined;
  const value = alignments[columnIndex];
  if (value === 'left' || value === 'right' || value === 'center') return value;
  return undefined;
}

function emitTable(
  table: SemanticNode,
  registry: ReferenceRegistry,
  stylesByRole: Record<string, ElementStyle>,
  inlineImageStyle: Record<string, unknown>,
  resolveImage: (node: SemanticNode) => ResolvedImage,
  linkMode: 'citation' | 'inline',
  linkOptions: {
    citationStyle: 'bracket' | 'paren';
    dedupe: boolean;
  },
  listContinuationStyle: ElementStyle | undefined,
  listMetrics: ListMetrics,
  tightListContext: boolean,
  tableConfig: TableStyleConfig
): Element[] {
  const rows = (table.children || []).filter((node) => node.kind === 'tableRow');
  const alignments = Array.isArray(table.align) ? table.align : undefined;
  const zebraEnabled = tableConfig.zebra === true;
  const zebraColor = tableConfig.zebraColor;
  const rowElements: Element[] = rows.map((row, rowIndex) => {
    const cells = (row.children || []).filter((node) => node.kind === 'tableCell');
    const cellElements: Element[] = cells.map((cell, cellIndex) => {
      const alignment = resolveTableCellAlignment(alignments, cellIndex);
      const isBodyRow = rowIndex > 0;
      const shouldStripe = zebraEnabled && isBodyRow && ((rowIndex - 1) % 2 === 1);
      const styleOverride = {
        ...(alignment ? { textAlign: alignment } : {}),
        ...(shouldStripe ? { backgroundColor: zebraColor } : {})
      };
      return {
        type: 'table-cell',
        content: '',
        children: inlineToElements(cell.children || [], registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions),
        properties: {
          ...(Object.keys(styleOverride).length > 0 ? { style: styleOverride } : {}),
          sourceRange: cell.sourceRange,
          sourceSyntax: cell.sourceSyntax
        }
      };
    });
    return {
      type: 'table-row',
      content: '',
      children: cellElements,
      properties: {
        ...(rowIndex === 0 ? { semanticRole: 'header' } : {}),
        sourceRange: row.sourceRange,
        sourceSyntax: row.sourceSyntax
      }
    };
  });

  const baseTableStyle = stylesByRole.table || {};
  const tableStyle: Record<string, unknown> = { ...baseTableStyle };
  const listIndent = listContinuationStyle?.textIndent;
  if (Number.isFinite(listIndent)) {
    tableStyle.marginLeft = Number(listIndent);
  }
  if (tightListContext) {
    tableStyle.marginBottom = listMetrics.tightItemSpacingAfter;
  }
  const headerCellStyle: Record<string, unknown> = {
    fontWeight: 700,
    ...(tableConfig.headerColor ? { backgroundColor: tableConfig.headerColor } : {})
  };

  return [{
    type: 'table',
    content: '',
    children: rowElements,
    properties: {
      table: {
        headerRows: 1,
        repeatHeader: true,
        headerCellStyle
      },
      ...(Object.keys(tableStyle).length > 0 ? { style: tableStyle } : {}),
      sourceRange: table.sourceRange,
      sourceSyntax: table.sourceSyntax
    }
  }];
}

function standaloneImageNode(paragraph: SemanticNode): SemanticNode | null {
  if (paragraph.kind !== 'p') return null;
  const children = paragraph.children || [];
  if (children.length !== 1) return null;
  return children[0].kind === 'image' ? children[0] : null;
}

function isCaptionParagraph(node: SemanticNode, captionPattern: RegExp): boolean {
  if (node.kind !== 'p') return false;
  const text = inlinePlainText(node.children || []).trim();
  return captionPattern.test(text);
}

function isFigureCaptionBlockquote(
  node: SemanticNode | undefined,
  previousNode: SemanticNode | undefined,
  enabled: boolean
): boolean {
  if (!enabled || !node || node.kind !== 'blockquote') return false;
  if (!previousNode) return false;
  return standaloneImageNode(previousNode) !== null;
}

function shouldFrameImage(imageNode: SemanticNode, frameConfig: ImageFrameConfig): boolean {
  if (frameConfig.mode === 'all') return true;
  if (frameConfig.mode !== 'opt-in') return false;
  return frameConfig.markerPattern.test((imageNode.title || '').trim());
}

function shouldKeepParagraphWithNext(block: SemanticNode, nextBlock: SemanticNode | undefined): boolean {
  if (block.kind !== 'p' || !nextBlock) return false;
  if (nextBlock.kind !== 'code' && nextBlock.kind !== 'blockquote') return false;
  const trailing = inlinePlainText(block.children || []).trimEnd();
  if (trailing.length === 0) return false;
  return /[:\u2014\u2013]$/.test(trailing);
}

function listItemLine(
  list: SemanticNode,
  item: SemanticNode,
  index: number,
  unorderedMarkers: string[],
  depthClamped: number,
  listMetrics: ListMetrics,
  orderedPath: number[]
): string {
  if (item.checked !== null && item.checked !== undefined) {
    return item.checked ? listMetrics.taskMarkers.checked : listMetrics.taskMarkers.unchecked;
  }

  if (list.kind === 'ul') {
    const marker = unorderedMarkers[depthClamped % unorderedMarkers.length] || '\u2022';
    return marker;
  }

  const start = list.start || 1;
  const value = start + index;
  const markerStyle = listMetrics.orderedMarkers[depthClamped % listMetrics.orderedMarkers.length] || 'decimal';
  return formatOrderedMarker(markerStyle, value, orderedPath);
}

function emitList(
  list: SemanticNode,
  depth: number,
  registry: ReferenceRegistry,
  stylesByRole: Record<string, ElementStyle>,
  listMetrics: ListMetrics,
  unorderedMarkers: string[],
  inlineImageStyle: Record<string, unknown>,
  blockImageStyle: Record<string, unknown>,
  captionConfig: CaptionConfig,
  titleSubheadingConfig: TitleSubheadingConfig,
  imageFrameConfig: ImageFrameConfig,
  resolveImage: (node: SemanticNode) => ResolvedImage,
  linkMode: 'citation' | 'inline',
  resolveCodeStyleForLanguage: (language?: string) => Record<string, unknown> | undefined,
  linkOptions: {
    citationStyle: 'bracket' | 'paren';
    dedupe: boolean;
  },
  orderedPath: number[],
  tightListContext: boolean,
  blockquoteAttributionPattern: RegExp,
  tableConfig: TableStyleConfig
): Element[] {
  const elements: Element[] = [];
  const depthClamped = Math.min(depth, 5);
  const markerGapSpaces = Math.max(1, Math.round(listMetrics.markerGap / 3));
  const markerPad = ' '.repeat(markerGapSpaces);
  const listRole = list.kind === 'ul' ? roles.ul : roles.ol;
  const items = (list.children || []).filter((node) => node.kind === 'li');

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const itemChildren = item.children || [];
    if (itemChildren.length === 0) continue;

    const first = itemChildren[0];
    const marker = listItemLine(list, item, index, unorderedMarkers, depthClamped, listMetrics, orderedPath);
    const styleType = `${listRole}_${depthClamped}`;
    const isTight = !!(list.listTight || tightListContext);
    const styleOverride = isTight ? { marginBottom: listMetrics.tightItemSpacingAfter } : undefined;
    const nextOrderedPath = list.kind === 'ol' ? [...orderedPath, (list.start || 1) + index] : orderedPath;

    if (first.kind === 'p') {
      elements.push({
        type: styleType,
        content: '',
        children: [{ type: 'text', content: `${marker}${markerPad}` }, ...inlineToElements(first.children || [], registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions)],
        properties: {
          style: styleOverride,
          sourceRange: item.sourceRange,
          sourceSyntax: item.sourceSyntax
        }
      });
    } else {
      elements.push({
        type: styleType,
        content: `${marker}${markerPad}`,
        properties: {
          style: styleOverride,
          sourceRange: item.sourceRange,
          sourceSyntax: item.sourceSyntax
        }
      });
      elements.push(...emitBlocks(
        [first],
        depth + 1,
        roles.liContinuation,
        registry,
        stylesByRole,
        listMetrics,
        unorderedMarkers,
        inlineImageStyle,
        blockImageStyle,
        captionConfig,
        titleSubheadingConfig,
        imageFrameConfig,
        resolveImage,
        linkMode,
        resolveCodeStyleForLanguage,
        linkOptions,
        nextOrderedPath,
        isTight,
        blockquoteAttributionPattern,
        tableConfig
      ));
    }

    for (let childIndex = 1; childIndex < itemChildren.length; childIndex += 1) {
      elements.push(...emitBlocks(
        [itemChildren[childIndex]],
        depth + 1,
        roles.liContinuation,
        registry,
        stylesByRole,
        listMetrics,
        unorderedMarkers,
        inlineImageStyle,
        blockImageStyle,
        captionConfig,
        titleSubheadingConfig,
        imageFrameConfig,
        resolveImage,
        linkMode,
        resolveCodeStyleForLanguage,
        linkOptions,
        nextOrderedPath,
        isTight,
        blockquoteAttributionPattern,
        tableConfig
      ));
    }
  }

  return elements;
}

function emitBlocks(
  blocks: SemanticNode[],
  depth: number,
  listContinuationRole: string | undefined,
  registry: ReferenceRegistry,
  stylesByRole: Record<string, ElementStyle>,
  listMetrics: ListMetrics,
  unorderedMarkers: string[],
  inlineImageStyle: Record<string, unknown>,
  blockImageStyle: Record<string, unknown>,
  captionConfig: CaptionConfig,
  titleSubheadingConfig: TitleSubheadingConfig,
  imageFrameConfig: ImageFrameConfig,
  resolveImage: (node: SemanticNode) => ResolvedImage,
  linkMode: 'citation' | 'inline',
  resolveCodeStyleForLanguage: (language?: string) => Record<string, unknown> | undefined,
  linkOptions: {
    citationStyle: 'bracket' | 'paren';
    dedupe: boolean;
  },
  orderedPath: number[],
  tightListContext: boolean,
  blockquoteAttributionPattern: RegExp,
  tableConfig: TableStyleConfig
): Element[] {
  const elements: Element[] = [];
  const continuationDepth = Math.min(depth, 5);
  const listContinuation = typeof listContinuationRole === 'string' && listContinuationRole.length > 0;
  const firstTopLevelH1Index = (!listContinuation && depth === 0)
    ? blocks.findIndex((node) => node.kind === 'h1')
    : -1;

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const previousBlock = blockIndex > 0 ? blocks[blockIndex - 1] : undefined;
    const nextBlock = blocks[blockIndex + 1];
    const startCount = elements.length;
    switch (block.kind) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        elements.push({
          type: roles[block.kind],
          content: '',
          children: inlineToElements(block.children || [], registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions),
          properties: {
            sourceRange: block.sourceRange,
            sourceSyntax: block.sourceSyntax
          }
        });
        break;
      case 'p':
      case 'dt':
      case 'dd': {
        const imageOnly = standaloneImageNode(block);
        if (imageOnly) {
          const resolvedImage = resolveImage(imageOnly);
          const nextIsCaptionParagraph = !listContinuation && !!nextBlock && isCaptionParagraph(nextBlock, captionConfig.pattern);
          const nextIsCaptionBlockquote = !listContinuation
            && isFigureCaptionBlockquote(nextBlock, block, captionConfig.blockquoteUnderImageAsFigureCaption);
          const shouldFrame = shouldFrameImage(imageOnly, imageFrameConfig);
          const baseImageStyle = listContinuation
            ? {
                ...(stylesByRole[`${listContinuationRole}_${continuationDepth}`] as Record<string, unknown> || {}),
                marginTop: 0,
                marginBottom: tightListContext ? listMetrics.tightItemSpacingAfter : listMetrics.itemSpacingAfter
              }
            : { ...blockImageStyle };
          const imageStyle = shouldFrame
            ? { ...baseImageStyle, ...imageFrameConfig.style }
            : baseImageStyle;
          elements.push({
            type: 'image',
            content: '',
            properties: {
              style: imageStyle,
              image: {
                data: resolvedImage.data,
                mimeType: resolvedImage.mimeType,
                fit: 'contain'
              },
              ...((nextIsCaptionParagraph || nextIsCaptionBlockquote) ? { keepWithNext: true } : {}),
              sourceRange: block.sourceRange,
              sourceSyntax: block.sourceSyntax
            }
          });
          break;
        }

        const isTitleSubheadingCandidate = titleSubheadingConfig.enabled
          && !listContinuation
          && depth === 0
          && block.kind === 'p'
          && previousBlock?.kind === 'h1'
          && (!titleSubheadingConfig.applyToFirstH1Only || (blockIndex - 1) === firstTopLevelH1Index);
        const paragraphText = inlinePlainText(block.children || []).trim();
        const hasSubheadingMarker = titleSubheadingConfig.markerPattern.test(paragraphText);
        const asTitleSubheading = isTitleSubheadingCandidate
          && (!titleSubheadingConfig.requireMarker || hasSubheadingMarker);
        const paragraphSource = asTitleSubheading && titleSubheadingConfig.stripMarker
          ? { ...block, children: stripLeadingMarker(block.children || [], titleSubheadingConfig.markerPattern) }
          : block;

        const paragraphType = block.kind === 'dt'
          ? roles.definitionTerm
          : block.kind === 'dd'
            ? roles.definitionDesc
            : asTitleSubheading
              ? roles.subheading
            : listContinuation
              ? `${listContinuationRole}_${continuationDepth}`
              : roles.p;
        const p = paragraphElement(paragraphType, paragraphSource, registry, stylesByRole, inlineImageStyle, resolveImage, linkMode, linkOptions);
        if (block.kind === 'p' && !asTitleSubheading && !listContinuation && isCaptionParagraph(block, captionConfig.pattern)) {
          p.properties = {
            ...(p.properties || {}),
            style: { ...captionConfig.style }
          };
        }
        if (asTitleSubheading && titleSubheadingConfig.keepWithNext) {
          p.properties = {
            ...(p.properties || {}),
            keepWithNext: true
          };
        }
        if (shouldKeepParagraphWithNext(block, nextBlock)) {
          p.properties = {
            ...(p.properties || {}),
            keepWithNext: true
          };
        }
        if (listContinuation && tightListContext) {
          p.properties = {
            ...(p.properties || {}),
            style: {
              marginTop: 0,
              marginBottom: listMetrics.tightItemSpacingAfter
            }
          };
        }
        elements.push(p);
        break;
      }
      case 'ul':
      case 'ol':
        elements.push(...emitList(
          block,
          depth + (listContinuation ? 1 : 0),
          registry,
          stylesByRole,
          listMetrics,
          unorderedMarkers,
          inlineImageStyle,
          blockImageStyle,
          captionConfig,
          titleSubheadingConfig,
          imageFrameConfig,
          resolveImage,
          linkMode,
          resolveCodeStyleForLanguage,
          linkOptions,
          orderedPath,
          tightListContext,
          blockquoteAttributionPattern,
          tableConfig
        ));
        break;
      case 'dl':
        elements.push(...emitBlocks(
          block.children || [],
          depth,
          undefined,
          registry,
          stylesByRole,
          listMetrics,
          unorderedMarkers,
          inlineImageStyle,
          blockImageStyle,
          captionConfig,
          titleSubheadingConfig,
          imageFrameConfig,
          resolveImage,
          linkMode,
          resolveCodeStyleForLanguage,
          linkOptions,
          orderedPath,
          tightListContext,
          blockquoteAttributionPattern,
          tableConfig
        ));
        break;
      case 'code': {
        const continuationType = `${listContinuationRole}_${continuationDepth}`;
        const continuationStyle = stylesByRole[continuationType] as Record<string, unknown> | undefined;
        const codeBlockStyle = stylesByRole[roles.code] as Record<string, unknown>;
        const modeStyle = resolveCodeStyleForLanguage(block.language);
        const resolvedCodeStyle = modeStyle ? { ...codeBlockStyle, ...modeStyle } : codeBlockStyle;
        elements.push({
          type: listContinuation ? continuationType : roles.code,
          content: block.value || '',
          properties: {
            style: listContinuation
              ? { ...resolvedCodeStyle, ...(continuationStyle || {}) }
              : { ...resolvedCodeStyle },
            language: block.language,
            sourceRange: block.sourceRange,
            sourceSyntax: block.sourceSyntax
          }
        });
        break;
      }
      case 'blockquote': {
        const asFigureCaption = !listContinuation
          && isFigureCaptionBlockquote(block, previousBlock, captionConfig.blockquoteUnderImageAsFigureCaption);
        const quotedType = listContinuation ? `${listContinuationRole}_${continuationDepth}` : roles.blockquote;
        const continuationStyle = listContinuation ? (stylesByRole[quotedType] as Record<string, unknown> | undefined) : undefined;
        const quoteStyle = stylesByRole[roles.blockquote] as Record<string, unknown>;
        const quoteAttributionStyle = stylesByRole[roles.blockquoteAttribution] as Record<string, unknown>;
        const quoteChildren = block.children || [];
        let attributionIndex = -1;
        if (quoteChildren.length > 0) {
          const last = quoteChildren[quoteChildren.length - 1];
          if (isBlockquoteAttributionParagraph(last, blockquoteAttributionPattern)) {
            attributionIndex = quoteChildren.length - 1;
          }
        }

        for (let idx = 0; idx < quoteChildren.length; idx += 1) {
          const child = quoteChildren[idx];
          const quoteChild = (idx === attributionIndex && child.kind === 'p')
            ? { ...child, children: stripBlockquoteAttributionMarker(child.children || [], blockquoteAttributionPattern) }
            : child;
          const quoteParts = emitBlocks(
            [quoteChild],
            depth + 1,
            undefined,
            registry,
            stylesByRole,
            listMetrics,
            unorderedMarkers,
            inlineImageStyle,
          blockImageStyle,
          captionConfig,
          titleSubheadingConfig,
          imageFrameConfig,
            resolveImage,
            linkMode,
            resolveCodeStyleForLanguage,
            linkOptions,
            orderedPath,
            tightListContext,
            blockquoteAttributionPattern,
            tableConfig
          );
          for (const quotePart of quoteParts) {
            const partStyle = asFigureCaption
              ? { ...captionConfig.blockquoteStyle }
              : idx === attributionIndex
                ? { ...quoteStyle, ...quoteAttributionStyle, ...(continuationStyle || {}) }
                : { ...quoteStyle, ...(continuationStyle || {}) };
            if (!asFigureCaption) {
              quotePart.type = quotedType;
            }
            quotePart.properties = {
              ...(quotePart.properties || {}),
              style: partStyle
            };
            elements.push(quotePart);
          }
        }
        break;
      }
      case 'table': {
        const continuationStyle = listContinuation
          ? (stylesByRole[`${listContinuationRole}_${continuationDepth}`] as ElementStyle | undefined)
          : undefined;
        elements.push(...emitTable(
          block,
          registry,
          stylesByRole,
          inlineImageStyle,
          resolveImage,
          linkMode,
          linkOptions,
          continuationStyle,
          listMetrics,
          tightListContext,
          tableConfig
        ));
        break;
      }
      case 'hr':
        elements.push({
          type: roles.hr,
          content: '',
          properties: {
            sourceRange: block.sourceRange,
            sourceSyntax: block.sourceSyntax
          }
        });
        break;
      default:
        break;
    }

    if (block.keepWithNext && elements.length > startCount) {
      const last = elements[elements.length - 1];
      last.properties = {
        ...(last.properties || {}),
        keepWithNext: true
      };
    }
  }

  return elements;
}

function emitReferences(
  registry: ReferenceRegistry,
  heading: string,
  numberingStyle: 'decimal' | 'lower-roman' | 'upper-roman',
  includeLinkTitle: boolean,
  stylesByRole: Record<string, ElementStyle>
): Element[] {
  if (registry.entries.length === 0) return [];

  const elements: Element[] = [
    { type: roles.hr, content: '' },
    { type: roles.referencesHeading, content: heading }
  ];

  for (const entry of registry.entries) {
    const prefix = `${formatReferenceNumber(entry.index, numberingStyle)}. `;
    const titlePart = includeLinkTitle && entry.title && entry.title.trim().length > 0 ? `${entry.title.trim()}. ` : '';
    elements.push({
      type: roles.referencesItem,
      content: '',
      children: [
        { type: 'text', content: `${prefix}${titlePart}` },
        {
          type: INLINE_CONTAINER_TYPE,
          content: '',
          properties: {
            style: { ...(stylesByRole[roles.link] as Record<string, unknown>) },
            linkTarget: entry.url
          },
          children: [{ type: 'text', content: entry.url }]
        }
      ]
    });
  }

  return elements;
}

export const markdownFormat: FormatModule = {
  name: 'markdown',
  listFlavors(): string[] {
    return listFlavorNames('markdown');
  },
  compile(document: SemanticDocument, inputPath: string, options?: { flavor?: string }): DocumentInput {
    const flavor = loadFormatFlavor<MarkdownFlavor>('markdown', options?.flavor);
    const stylesByRole = createStyles(flavor);
    const listMetrics = resolveListMetrics(flavor);
    const resolveImage = createImageResolver(inputPath);
    const inlineImageStyle = resolveInlineImageStyle(flavor);
    const blockImageStyle = resolveBlockImageStyle(flavor);
    const captionConfig = resolveCaptionConfig(flavor);
    const titleSubheadingConfig = resolveTitleSubheadingConfig(flavor);
    const imageFrameConfig = resolveImageFrameConfig(flavor);
    const unorderedMarkers = flavor.list?.unorderedMarkers && flavor.list.unorderedMarkers.length > 0
      ? flavor.list.unorderedMarkers
      : ['\u2022', '\u25e6', '\u25aa'];
    const linkMode = flavor.links?.mode === 'inline' ? 'inline' : 'citation';
    const linkOptions = {
      citationStyle: flavor.links?.citationStyle || 'bracket',
      dedupe: flavor.links?.dedupe !== false
    } as const;
    const blockquoteAttributionEnabled = flavor.blockquote?.attribution?.enabled !== false;
    const blockquoteAttributionPattern = blockquoteAttributionEnabled
      ? new RegExp(flavor.blockquote?.attribution?.markerPattern || '^[-\u2014\u2013]\\s+')
      : /^$/;
    const resolveCodeStyleForLanguage = (language?: string) => resolveCodeBlockStyleOverride(flavor, language);
    const tableConfig: TableStyleConfig = {
      zebra: flavor.tables?.zebra === true,
      zebraColor: flavor.tables?.zebraColor || '#f7f9fc',
      headerColor: flavor.tables?.headerColor
    };
    const references = createReferenceRegistry();
    const bodyElements = emitBlocks(
      document.children,
      0,
      undefined,
      references,
      stylesByRole,
      listMetrics,
      unorderedMarkers,
      inlineImageStyle,
      blockImageStyle,
      captionConfig,
      titleSubheadingConfig,
      imageFrameConfig,
      resolveImage,
      linkMode,
      resolveCodeStyleForLanguage,
      linkOptions,
      [],
      false,
      blockquoteAttributionPattern,
      tableConfig
    );
    const referencesEnabled = flavor.references?.enabled !== false && linkMode === 'citation';
    const referenceElements = referencesEnabled
      ? emitReferences(
          references,
          flavor.references?.heading || 'References',
          flavor.references?.numberingStyle || 'decimal',
          flavor.references?.includeLinkTitle !== false,
          stylesByRole
        )
      : [];

    return {
      documentVersion: '1.0',
      layout: {
        pageSize: 'LETTER',
        margins: { top: 78, right: 80, bottom: 78, left: 80 },
        fontFamily: resolveBaseStyle(flavor).fontFamily as string,
        fontSize: resolveBaseStyle(flavor).fontSize as number,
        lineHeight: resolveBaseStyle(flavor).lineHeight as number,
        hyphenation: 'auto',
        justifyEngine: 'advanced',
        justifyStrategy: 'auto',
        showPageNumbers: true,
        pageNumberFormat: '{n}',
        pageNumberPosition: 'bottom',
        pageNumberAlignment: 'center',
        pageNumberOffset: 34,
        pageNumberStartPage: 1,
        pageNumberFontSize: 9,
        pageNumberColor: '#5e5e5e',
        pageNumberFont: resolveBaseStyle(flavor).fontFamily as string,
        ...(flavor.layout || {})
      },
      styles: stylesByRole,
      elements: [...bodyElements, ...referenceElements]
    };
  }
};


