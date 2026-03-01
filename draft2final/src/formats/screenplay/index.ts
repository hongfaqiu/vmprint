import type { DocumentInput, Element, ElementStyle } from '@vmprint/engine';
import { SemanticDocument, SemanticNode } from '../../semantic';
import { FormatModule } from '../types';
import { loadFormatFlavor, listFlavorNames } from '../flavor-loader';

type ScreenplayFlavor = {
  layout?: Partial<DocumentInput['layout']>;
  styles?: Record<string, ElementStyle>;
  production?: {
    sceneNumbers?: {
      enabled?: boolean;
      start?: number;
      pad?: number;
      style?: 'decimal' | 'alpha';
    };
    lockedPages?: {
      enabled?: boolean;
      revisionLabel?: string;
      placement?: 'suffix' | 'prefix';
    };
  };
};

type ScreenplayProductionConfig = {
  sceneNumbersEnabled: boolean;
  sceneNumberStart: number;
  sceneNumberPad: number;
  sceneNumberStyle: 'decimal' | 'alpha';
  lockedPagesEnabled: boolean;
  lockedPagesRevisionLabel: string;
  lockedPagesPlacement: 'suffix' | 'prefix';
};

const roles = {
  title: 'd2f_sp_title',
  titleMeta: 'd2f_sp_title_meta',
  titleContact: 'd2f_sp_title_contact',
  sceneHeading: 'd2f_sp_scene_heading',
  action: 'd2f_sp_action',
  character: 'd2f_sp_character',
  parenthetical: 'd2f_sp_parenthetical',
  dialogue: 'd2f_sp_dialogue',
  characterDualLeft: 'd2f_sp_character_dual_left',
  parentheticalDualLeft: 'd2f_sp_parenthetical_dual_left',
  dialogueDualLeft: 'd2f_sp_dialogue_dual_left',
  characterDualRight: 'd2f_sp_character_dual_right',
  parentheticalDualRight: 'd2f_sp_parenthetical_dual_right',
  dialogueDualRight: 'd2f_sp_dialogue_dual_right',
  transition: 'd2f_sp_transition',
  intertitle: 'd2f_sp_intertitle',
  insert: 'd2f_sp_insert',
  more: 'd2f_sp_more',
  beat: 'd2f_sp_beat'
} as const;

const baseStyle: ElementStyle = {
  fontFamily: 'Courier Prime',
  fontSize: 12,
  lineHeight: 1,
  color: '#111111'
};

function createStyles(flavor: ScreenplayFlavor): Record<string, ElementStyle> {
  const styles: Record<string, ElementStyle> = {
    text: { ...baseStyle },
    [roles.title]: {
      ...baseStyle,
      textAlign: 'center',
      marginLeft: -36,
      width: 468,
      marginTop: 180,
      marginBottom: 12,
      pageBreakBefore: true,
      keepWithNext: true
    },
    [roles.titleMeta]: {
      ...baseStyle,
      textAlign: 'center',
      marginLeft: -36,
      width: 468,
      marginTop: 0,
      marginBottom: 0
    },
    [roles.titleContact]: {
      ...baseStyle,
      textAlign: 'left',
      marginLeft: -36,
      width: 468,
      marginTop: 0,
      marginBottom: 0
    },
    [roles.sceneHeading]: {
      ...baseStyle,
      marginTop: 12,
      marginBottom: 12,
      keepWithNext: true
    },
    [roles.action]: {
      ...baseStyle,
      allowLineSplit: true,
      orphans: 2,
      widows: 2,
      marginTop: 0,
      marginBottom: 12
    },
    [roles.character]: {
      ...baseStyle,
      marginLeft: 158.4,
      width: 165.6,
      marginTop: 12,
      marginBottom: 0,
      keepWithNext: true
    },
    [roles.parenthetical]: {
      ...baseStyle,
      marginLeft: 115.2,
      width: 172.8,
      marginTop: 0,
      marginBottom: 0,
      keepWithNext: true
    },
    [roles.dialogue]: {
      ...baseStyle,
      marginLeft: 72,
      width: 252,
      allowLineSplit: true,
      orphans: 2,
      widows: 2,
      marginTop: 0,
      marginBottom: 12
    },
    [roles.characterDualLeft]: {
      ...baseStyle,
      marginLeft: 54,
      width: 150,
      marginTop: 12,
      marginBottom: 0,
      keepWithNext: true
    },
    [roles.parentheticalDualLeft]: {
      ...baseStyle,
      marginLeft: 36,
      width: 162,
      marginTop: 0,
      marginBottom: 0,
      keepWithNext: true
    },
    [roles.dialogueDualLeft]: {
      ...baseStyle,
      marginLeft: 0,
      width: 204,
      allowLineSplit: true,
      orphans: 2,
      widows: 2,
      marginTop: 0,
      marginBottom: 6
    },
    [roles.characterDualRight]: {
      ...baseStyle,
      marginLeft: 282,
      width: 150,
      marginTop: 12,
      marginBottom: 0,
      keepWithNext: true
    },
    [roles.parentheticalDualRight]: {
      ...baseStyle,
      marginLeft: 264,
      width: 162,
      marginTop: 0,
      marginBottom: 0,
      keepWithNext: true
    },
    [roles.dialogueDualRight]: {
      ...baseStyle,
      marginLeft: 228,
      width: 204,
      allowLineSplit: true,
      orphans: 2,
      widows: 2,
      marginTop: 0,
      marginBottom: 6
    },
    [roles.transition]: {
      ...baseStyle,
      textAlign: 'right',
      marginTop: 12,
      marginBottom: 12
    },
    [roles.intertitle]: {
      ...baseStyle,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 10
    },
    [roles.insert]: {
      ...baseStyle,
      marginTop: 12,
      marginBottom: 12
    },
    [roles.more]: {
      ...baseStyle,
      textAlign: 'right',
      marginLeft: 72,
      width: 252,
      marginTop: 0,
      marginBottom: 0
    },
    [roles.beat]: {
      ...baseStyle,
      lineHeight: 1,
      borderTopWidth: 0.7,
      borderTopColor: '#111111',
      marginTop: 12,
      marginBottom: 12
    }
  };

  if (flavor.styles) {
    for (const [key, value] of Object.entries(flavor.styles)) {
      styles[key] = { ...(styles[key] || {}), ...value };
    }
  }

  return styles;
}

type InlinePart = {
  text: string;
  style?: Record<string, unknown>;
};

function stylesEqual(a?: Record<string, unknown>, b?: Record<string, unknown>): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function mergeInlineStyle(
  base?: Record<string, unknown>,
  next?: Record<string, unknown>
): Record<string, unknown> | undefined {
  const merged = { ...(base || {}), ...(next || {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function pushInlinePart(parts: InlinePart[], text: string, style?: Record<string, unknown>): void {
  if (!text) return;
  const normalizedStyle = style && Object.keys(style).length > 0 ? style : undefined;
  const last = parts[parts.length - 1];
  if (last && stylesEqual(last.style, normalizedStyle)) {
    last.text += text;
    return;
  }
  parts.push(normalizedStyle ? { text, style: normalizedStyle } : { text });
}

function inlinePartsToPlainText(parts: InlinePart[]): string {
  return parts.map((part) => part.text).join('');
}

function hasInlineContent(parts: InlinePart[]): boolean {
  return inlinePartsToPlainText(parts).trim().length > 0;
}

function normalizeInlineParts(parts: InlinePart[]): InlinePart[] {
  const out: InlinePart[] = [];
  let pendingSpace = false;

  for (const part of parts) {
    for (const char of part.text) {
      if (/\s/.test(char)) {
        pendingSpace = true;
        continue;
      }

      if (pendingSpace && out.length > 0) {
        pushInlinePart(out, ' ');
      }
      pendingSpace = false;
      pushInlinePart(out, char, part.style);
    }
  }

  return out;
}

function upperInlineParts(parts: InlinePart[]): InlinePart[] {
  return parts.map((part) => (
    part.style
      ? { text: part.text.toUpperCase(), style: { ...part.style } }
      : { text: part.text.toUpperCase() }
  ));
}

function inlinePartsToElements(parts: InlinePart[]): Element[] {
  const elements: Element[] = [];
  for (const part of parts) {
    if (!part.text) continue;
    elements.push(
      part.style
        ? { type: 'text', content: part.text, properties: { style: { ...part.style } } }
        : { type: 'text', content: part.text }
    );
  }
  return elements;
}

function inlineNodesToParts(
  nodes: SemanticNode[],
  inheritedStyle?: Record<string, unknown>
): InlinePart[] {
  const parts: InlinePart[] = [];

  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
      case 'inlineCode':
        pushInlinePart(parts, node.value || '', inheritedStyle);
        break;
      case 'em':
        parts.push(...inlineNodesToParts(
          node.children || [],
          mergeInlineStyle(inheritedStyle, { fontStyle: 'italic' })
        ));
        break;
      case 'strong':
        parts.push(...inlineNodesToParts(
          node.children || [],
          mergeInlineStyle(inheritedStyle, { fontWeight: 700 })
        ));
        break;
      case 'link':
        parts.push(...inlineNodesToParts(node.children || [], inheritedStyle));
        break;
      default:
        break;
    }
  }

  return parts;
}

function ensureParenthetical(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '(...)';
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return trimmed;
  return `(${trimmed})`;
}

function normalizeLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeUpper(value: string): string {
  return normalizeLine(value).toUpperCase();
}

function toAlpha(value: number): string {
  let n = Math.max(1, Math.floor(value));
  let out = '';
  while (n > 0) {
    n -= 1;
    const charCode = (n % 26) + 65;
    out = String.fromCharCode(charCode) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function resolveProduction(flavor: ScreenplayFlavor): ScreenplayProductionConfig {
  const sceneCfg = flavor.production?.sceneNumbers;
  const lockedCfg = flavor.production?.lockedPages;
  return {
    sceneNumbersEnabled: !!sceneCfg?.enabled,
    sceneNumberStart: Math.max(1, Math.floor(sceneCfg?.start || 1)),
    sceneNumberPad: Math.max(0, Math.floor(sceneCfg?.pad || 0)),
    sceneNumberStyle: sceneCfg?.style === 'alpha' ? 'alpha' : 'decimal',
    lockedPagesEnabled: !!lockedCfg?.enabled,
    lockedPagesRevisionLabel: (lockedCfg?.revisionLabel || 'A').trim() || 'A',
    lockedPagesPlacement: lockedCfg?.placement === 'prefix' ? 'prefix' : 'suffix'
  };
}

function formatSceneNumber(value: number, config: ScreenplayProductionConfig): string {
  const raw = config.sceneNumberStyle === 'alpha' ? toAlpha(value) : String(value);
  if (config.sceneNumberPad <= 0) return raw;
  return raw.padStart(config.sceneNumberPad, '0');
}

function withSceneNumberParts(parts: InlinePart[], sceneNumber: string): InlinePart[] {
  const out: InlinePart[] = [];
  pushInlinePart(out, `${sceneNumber} `);
  for (const part of parts) {
    pushInlinePart(out, part.text, part.style);
  }
  pushInlinePart(out, ` ${sceneNumber}`);
  return out;
}

type DialogueBreakKind = 'soft' | 'hard';

type DialogueLine = {
  parts: InlinePart[];
  breakAfter?: DialogueBreakKind;
};

type DialogueParagraph = {
  lines: DialogueLine[];
};

type DialogueToken =
  | { kind: 'text'; value: string; style?: Record<string, unknown> }
  | { kind: 'hardBreak' };

function collectDialogueTokens(
  nodes: SemanticNode[],
  inheritedStyle?: Record<string, unknown>
): DialogueToken[] {
  const tokens: DialogueToken[] = [];

  for (const node of nodes) {
    switch (node.kind) {
      case 'text': {
        const value = node.value || '';
        if (node.sourceSyntax === 'break' && value === '\n') {
          tokens.push({ kind: 'hardBreak' });
        } else {
          tokens.push({ kind: 'text', value, style: inheritedStyle });
        }
        break;
      }
      case 'inlineCode':
        tokens.push({ kind: 'text', value: node.value || '', style: inheritedStyle });
        break;
      case 'em':
        tokens.push(...collectDialogueTokens(
          node.children || [],
          mergeInlineStyle(inheritedStyle, { fontStyle: 'italic' })
        ));
        break;
      case 'strong':
        tokens.push(...collectDialogueTokens(
          node.children || [],
          mergeInlineStyle(inheritedStyle, { fontWeight: 700 })
        ));
        break;
      case 'link':
        tokens.push(...collectDialogueTokens(node.children || [], inheritedStyle));
        break;
      default:
        break;
    }
  }

  return tokens;
}

function paragraphNodeToDialogueLines(paragraph: SemanticNode): DialogueLine[] {
  const tokens = collectDialogueTokens(paragraph.children || []);
  const lines: DialogueLine[] = [{ parts: [] }];

  const pushBreak = (kind: DialogueBreakKind) => {
    lines[lines.length - 1].breakAfter = kind;
    lines.push({ parts: [] });
  };

  for (const token of tokens) {
    if (token.kind === 'hardBreak') {
      pushBreak('hard');
      continue;
    }

    const parts = token.value.split(/\r?\n/);
    pushInlinePart(lines[lines.length - 1].parts, parts[0] || '', token.style);

    for (let idx = 1; idx < parts.length; idx += 1) {
      pushBreak('soft');
      pushInlinePart(lines[lines.length - 1].parts, parts[idx] || '', token.style);
    }
  }

  return lines;
}

function dialogueLineText(line: DialogueLine): string {
  return inlinePartsToPlainText(normalizeInlineParts(line.parts));
}

function buildDialogueParagraphParts(lines: DialogueLine[], startIndex: number = 0): InlinePart[] {
  const sliced = lines.slice(startIndex);
  if (sliced.length === 0) return [];

  const normalizedSegments = sliced.map((line) => normalizeInlineParts(line.parts));
  if (normalizedSegments.every((segment) => segment.length === 0)) return [];

  let firstNonEmpty = -1;
  let lastNonEmpty = -1;
  for (let idx = 0; idx < normalizedSegments.length; idx += 1) {
    if (normalizedSegments[idx].length > 0) {
      if (firstNonEmpty < 0) firstNonEmpty = idx;
      lastNonEmpty = idx;
    }
  }

  if (firstNonEmpty < 0 || lastNonEmpty < firstNonEmpty) return [];

  const textParts: InlinePart[] = [];
  for (let idx = firstNonEmpty; idx <= lastNonEmpty; idx += 1) {
    if (idx > firstNonEmpty) {
      const separator = sliced[idx - 1].breakAfter === 'hard' ? '\n' : ' ';
      pushInlinePart(textParts, separator);
    }

    for (const part of normalizedSegments[idx]) {
      pushInlinePart(textParts, part.text, part.style);
    }
  }

  return textParts;
}

function findNextNonEmptyLineIndex(lines: DialogueLine[], startIndex: number): number {
  for (let idx = Math.max(0, startIndex); idx < lines.length; idx += 1) {
    if (dialogueLineText(lines[idx]).length > 0) return idx;
  }
  return -1;
}

function joinParagraphParts(paragraphs: InlinePart[][], separator: string): InlinePart[] {
  const out: InlinePart[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) continue;
    if (out.length > 0) {
      pushInlinePart(out, separator);
    }
    for (const part of paragraph) {
      pushInlinePart(out, part.text, part.style);
    }
  }
  return out;
}

function buildDialogueChildren(paragraphs: InlinePart[][]): Element[] {
  const children: Element[] = [];
  for (let idx = 0; idx < paragraphs.length; idx += 1) {
    if (idx > 0) {
      children.push({ type: 'text', content: '\n\n' });
    }
    children.push(...inlinePartsToElements(paragraphs[idx]));
  }
  return children;
}

type SpeakerCue = {
  name: string;
  qualifier?: string;
  hasContd: boolean;
  dual: boolean;
};

type DialogueTurnEmission = {
  elements: Element[];
  isDual: boolean;
};

const SPEAKER_CUE_PATTERN = /^@([^\n()]{1,48})(?:\s+\(([^)]+)\))?$/i;

function parseSpeakerCue(line: string): SpeakerCue | null {
  const normalized = normalizeLine(line);
  const dual = normalized.endsWith('^');
  const withoutDual = dual ? normalized.slice(0, -1).trimEnd() : normalized;
  const match = withoutDual.match(SPEAKER_CUE_PATTERN);
  if (!match) return null;

  const name = normalizeLine(match[1] || '');
  if (!name) return null;

  const qualifier = normalizeLine(match[2] || '');
  const hasContd = /CONT'?D/i.test(qualifier);
  return { name, qualifier: qualifier || undefined, hasContd, dual };
}

function formatSpeakerCue(cue: SpeakerCue, forceContd: boolean): string {
  const chunks: string[] = [];
  if (cue.qualifier) chunks.push(cue.qualifier.toUpperCase());
  if (forceContd && !cue.hasContd) chunks.push("CONT'D");

  const base = cue.name.toUpperCase();
  if (chunks.length === 0) return base;
  return `${base} (${chunks.join(') (')})`;
}

function isTransitionParagraph(value: string): boolean {
  const normalized = normalizeLine(value);
  if (!normalized.endsWith(':')) return false;
  if (normalized !== normalized.toUpperCase()) return false;
  return /^[A-Z0-9 .'"()/-]+:$/.test(normalized);
}

function isSceneHeadingLine(value: string): boolean {
  return /^(INT\.|EXT\.|INT\/EXT\.|EST\.)/i.test(normalizeLine(value));
}

function asElement(
  type: string,
  content: string,
  source: SemanticNode,
  extras?: Record<string, unknown>,
  children?: Element[]
): Element {
  const element: Element = {
    type,
    content,
    properties: {
      sourceRange: source.sourceRange,
      sourceSyntax: source.sourceSyntax,
      ...(extras || {})
    }
  };

  if (children && children.length > 0) {
    element.children = children;
  }

  return element;
}

function blockToInlineParts(block: SemanticNode): InlinePart[] {
  switch (block.kind) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
    case 'p':
      return normalizeInlineParts(inlineNodesToParts(block.children || []));
    case 'code':
      return normalizeInlineParts([{ text: block.value || '' }]);
    case 'blockquote':
    case 'ul':
    case 'ol':
    case 'li': {
      const out: InlinePart[] = [];
      for (const child of block.children || []) {
        const childParts = blockToInlineParts(child);
        if (childParts.length === 0) continue;
        if (out.length > 0) {
          pushInlinePart(out, ' ');
        }
        for (const part of childParts) {
          pushInlinePart(out, part.text, part.style);
        }
      }
      return out;
    }
    case 'hr':
      return [];
    default:
      return [];
  }
}

function blockToText(block: SemanticNode): string {
  return inlinePartsToPlainText(blockToInlineParts(block));
}

function blockquoteDialogueParagraphs(block: SemanticNode): DialogueParagraph[] {
  const paragraphs: DialogueParagraph[] = [];

  for (const child of block.children || []) {
    if (child.kind === 'p') {
      paragraphs.push({ lines: paragraphNodeToDialogueLines(child) });
      continue;
    }
    if (child.kind === 'code') {
      const codeParts = normalizeInlineParts([{ text: child.value || '' }]);
      if (codeParts.length > 0) {
        paragraphs.push({ lines: [{ parts: codeParts }] });
      }
      continue;
    }
    const fallbackParts = blockToInlineParts(child);
    if (fallbackParts.length > 0) {
      paragraphs.push({ lines: [{ parts: fallbackParts }] });
    }
  }

  return paragraphs;
}

type TitleMetaKind = 'meta' | 'contact' | 'unknown';

function parseTitleMeta(raw: string): { key?: string; value: string; kind: TitleMetaKind } {
  const line = normalizeLine(raw);
  const match = line.match(/^([^:]{1,48}):\s*(.+)$/);
  if (!match) return { value: line, kind: 'unknown' };

  const key = normalizeLine(match[1]).toLowerCase();
  const value = normalizeLine(match[2]);
  if (!value) return { key, value: line, kind: 'unknown' };

  const contactKeys = new Set([
    'contact',
    'email',
    'phone',
    'address',
    'agent',
    'manager',
    'representation',
    'website'
  ]);

  if (contactKeys.has(key)) {
    return { key, value: `${match[1].trim()}: ${value}`, kind: 'contact' };
  }

  return { key, value: `${match[1].trim()}: ${value}`, kind: 'meta' };
}

function emitDialogueTurn(block: SemanticNode): DialogueTurnEmission {
  const paragraphs = blockquoteDialogueParagraphs(block);
  if (paragraphs.length === 0) return { elements: [], isDual: false };

  const firstParagraph = paragraphs[0];
  const cueLineIndex = findNextNonEmptyLineIndex(firstParagraph.lines, 0);
  if (cueLineIndex < 0) return { elements: [], isDual: false };

  const cue = parseSpeakerCue(dialogueLineText(firstParagraph.lines[cueLineIndex]));
  if (!cue) {
    const paragraphParts = paragraphs
      .map((paragraph) => buildDialogueParagraphParts(paragraph.lines))
      .filter((parts) => parts.length > 0);
    const joined = joinParagraphParts(paragraphParts, ' ');
    return { elements: [asElement(roles.action, '', block, undefined, inlinePartsToElements(joined))], isDual: false };
  }

  const elements: Element[] = [];
  elements.push(asElement(roles.character, formatSpeakerCue(cue, false), block));

  let consumedThroughLine = cueLineIndex;
  let continuationParenthetical: string | undefined;
  const parentheticalLineIndex = findNextNonEmptyLineIndex(firstParagraph.lines, cueLineIndex + 1);
  if (parentheticalLineIndex >= 0) {
    const parentheticalCandidate = normalizeLine(dialogueLineText(firstParagraph.lines[parentheticalLineIndex]));
    if (/^\(.*\)$/.test(parentheticalCandidate)) {
      const normalizedParenthetical = ensureParenthetical(parentheticalCandidate);
      elements.push(asElement(roles.parenthetical, normalizedParenthetical, block));
      continuationParenthetical = normalizedParenthetical;
      consumedThroughLine = parentheticalLineIndex;
    }
  }

  const dialogueParagraphs: InlinePart[][] = [];
  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const paragraph = paragraphs[paragraphIndex];
    const startIndex = paragraphIndex === 0 ? consumedThroughLine + 1 : 0;
    const textParts = buildDialogueParagraphParts(paragraph.lines, startIndex);
    if (textParts.length > 0) {
      dialogueParagraphs.push(textParts);
    }
  }

  if (dialogueParagraphs.length > 0) {
    const markersBeforeContinuation: Array<Record<string, unknown>> = [
      {
        type: roles.character,
        content: formatSpeakerCue(cue, true),
        properties: {
          keepWithNext: true
        }
      }
    ];

    if (continuationParenthetical) {
      markersBeforeContinuation.push({
        type: roles.parenthetical,
        content: continuationParenthetical,
        properties: {
          keepWithNext: true
        }
      });
    }

    elements.push(asElement(roles.dialogue, '', block, {
      paginationContinuation: {
        enabled: true,
        markerAfterSplit: {
          type: roles.more,
          content: '(MORE)'
        },
        markersBeforeContinuation,
        markerBeforeContinuation: {
          type: roles.character,
          content: formatSpeakerCue(cue, true),
          properties: {
            keepWithNext: true
          }
        }
      }
    }, buildDialogueChildren(dialogueParagraphs)));
  }

  return { elements, isDual: cue.dual };
}

function toDualTurn(turn: Element[], side: 'left' | 'right'): Element[] {
  const mapped = turn.map((element) => {
    const nextType = (() => {
      if (side === 'left') {
        if (element.type === roles.character) return roles.characterDualLeft;
        if (element.type === roles.parenthetical) return roles.parentheticalDualLeft;
        if (element.type === roles.dialogue) return roles.dialogueDualLeft;
      } else {
        if (element.type === roles.character) return roles.characterDualRight;
        if (element.type === roles.parenthetical) return roles.parentheticalDualRight;
        if (element.type === roles.dialogue) return roles.dialogueDualRight;
      }
      return element.type;
    })();

    return { ...element, type: nextType };
  });

  if (side === 'right' && mapped.length > 0) {
    mapped[0] = {
      ...mapped[0],
      properties: {
        ...(mapped[0].properties || {}),
        style: {
          ...((mapped[0].properties?.style as Record<string, unknown>) || {}),
          marginTop: 0
        }
      }
    };
  }

  return mapped;
}

function emitBlocks(blocks: SemanticNode[], production: ScreenplayProductionConfig): Element[] {
  const elements: Element[] = [];
  let seenSceneHeading = false;
  let emittedTitleContact = false;
  let hasTitle = false;
  let coverBreakPending = false;
  let insertedCoverBreak = false;
  let sceneNumber = production.sceneNumberStart;

  const applyCoverBreak = (extras?: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (!coverBreakPending || insertedCoverBreak) return extras;
    insertedCoverBreak = true;
    const existingStyle = (extras?.style && typeof extras.style === 'object')
      ? (extras.style as Record<string, unknown>)
      : {};
    return {
      ...(extras || {}),
      style: {
        ...existingStyle,
        pageBreakBefore: true
      }
    };
  };

  const coverPageMeta = (): Record<string, unknown> => ({
    layoutDirectives: {
      suppressPageNumber: true
    }
  });

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const nextBlock = blocks[blockIndex + 1];
    switch (block.kind) {
      case 'h1': {
        const contentParts = normalizeInlineParts(inlineNodesToParts(block.children || []));
        if (!hasInlineContent(contentParts)) break;
        hasTitle = true;
        coverBreakPending = true;
        elements.push(asElement(roles.title, '', block, coverPageMeta(), inlinePartsToElements(contentParts)));
        break;
      }
      case 'h2': {
        let contentParts = upperInlineParts(normalizeInlineParts(inlineNodesToParts(block.children || [])));
        if (production.sceneNumbersEnabled) {
          contentParts = withSceneNumberParts(contentParts, formatSceneNumber(sceneNumber, production));
          sceneNumber += 1;
        }
        const content = inlinePartsToPlainText(contentParts);
        if (!content) break;
        seenSceneHeading = true;
        elements.push(asElement(roles.sceneHeading, '', block, applyCoverBreak(), inlinePartsToElements(contentParts)));
        break;
      }
      case 'h3': {
        const contentParts = normalizeInlineParts(inlineNodesToParts(block.children || []));
        const content = inlinePartsToPlainText(contentParts);
        if (!content) break;
        if (content.endsWith(':')) {
          const transitionParts = upperInlineParts(contentParts);
          elements.push(asElement(roles.transition, '', block, applyCoverBreak(), inlinePartsToElements(transitionParts)));
        } else {
          elements.push(asElement(roles.action, '', block, applyCoverBreak(), inlinePartsToElements(contentParts)));
        }
        break;
      }
      case 'h4':
      case 'h5':
      case 'h6': {
        const contentParts = upperInlineParts(normalizeInlineParts(inlineNodesToParts(block.children || [])));
        const content = inlinePartsToPlainText(contentParts);
        if (!content) break;
        elements.push(asElement(roles.intertitle, '', block, applyCoverBreak(), inlinePartsToElements(contentParts)));
        break;
      }
      case 'p': {
        const contentParts = normalizeInlineParts(inlineNodesToParts(block.children || []));
        const content = inlinePartsToPlainText(contentParts);
        if (!content) break;
        if (isSceneHeadingLine(content)) {
          seenSceneHeading = true;
          let sceneHeadingParts = upperInlineParts(contentParts);
          if (production.sceneNumbersEnabled) {
            sceneHeadingParts = withSceneNumberParts(sceneHeadingParts, formatSceneNumber(sceneNumber, production));
            sceneNumber += 1;
          }
          elements.push(asElement(roles.sceneHeading, '', block, applyCoverBreak(), inlinePartsToElements(sceneHeadingParts)));
          break;
        }
        if (isTransitionParagraph(content)) {
          const transitionParts = upperInlineParts(contentParts);
          elements.push(asElement(roles.transition, '', block, applyCoverBreak(), inlinePartsToElements(transitionParts)));
          break;
        }
        elements.push(asElement(roles.action, '', block, applyCoverBreak(), inlinePartsToElements(contentParts)));
        break;
      }
      case 'code': {
        const maybeBreak = applyCoverBreak();
        const existingStyle = (maybeBreak?.style && typeof maybeBreak.style === 'object')
          ? (maybeBreak.style as Record<string, unknown>)
          : {};
        elements.push({
          ...asElement(roles.insert, block.value || '', block),
          properties: {
            sourceRange: block.sourceRange,
            sourceSyntax: block.sourceSyntax
          }
        });
        if (maybeBreak) {
          const last = elements[elements.length - 1];
          last.properties = {
            ...last.properties,
            ...Object.fromEntries(Object.entries(maybeBreak).filter(([k]) => k !== 'style')),
            style: {
              ...(last.properties?.style || {}),
              ...existingStyle
            }
          };
        }
        break;
      }
      case 'blockquote': {
        const turn = emitDialogueTurn(block);
        const dualPairCandidate = turn.isDual && nextBlock?.kind === 'blockquote';

        if (dualPairCandidate) {
          const nextTurn = emitDialogueTurn(nextBlock as SemanticNode);
          if (nextTurn.isDual) {
            const leftTurn = toDualTurn(turn.elements, 'left');
            const rightTurn = toDualTurn(nextTurn.elements, 'right');
            if (leftTurn.length > 0) {
              const lastLeft = leftTurn[leftTurn.length - 1];
              lastLeft.properties = {
                ...(lastLeft.properties || {}),
                style: {
                  ...((lastLeft.properties?.style as Record<string, unknown>) || {}),
                  marginBottom: 0
                }
              };
            }

            const maybeBreak = applyCoverBreak();
            if (maybeBreak && leftTurn.length > 0) {
              leftTurn[0] = {
                ...leftTurn[0],
                properties: {
                  ...(leftTurn[0].properties || {}),
                  ...Object.fromEntries(Object.entries(maybeBreak).filter(([k]) => k !== 'style')),
                  style: {
                    ...((leftTurn[0].properties?.style as Record<string, unknown>) || {}),
                    ...(((maybeBreak.style as Record<string, unknown>) || {}))
                  }
                }
              };
            }

            elements.push(...leftTurn, ...rightTurn);
            blockIndex += 1;
            break;
          }
        }

        if (turn.elements.length > 0) {
          const maybeBreak = applyCoverBreak();
          if (maybeBreak) {
            turn.elements[0] = {
              ...turn.elements[0],
              properties: {
                ...(turn.elements[0].properties || {}),
                ...Object.fromEntries(Object.entries(maybeBreak).filter(([k]) => k !== 'style')),
                style: {
                  ...((turn.elements[0].properties?.style as Record<string, unknown>) || {}),
                  ...(((maybeBreak.style as Record<string, unknown>) || {}))
                }
              }
            };
          }
          elements.push(...turn.elements);
        }
        break;
      }
      case 'ul':
      case 'ol': {
        const markerPrefix = block.kind === 'ul' ? '- ' : '';
        const orderedStart = block.start || 1;
        const items = (block.children || []).filter((item) => item.kind === 'li');

        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const rawParts = blockToInlineParts(item);
          const raw = inlinePartsToPlainText(rawParts);
          if (!raw) continue;
          if (!seenSceneHeading) {
            const parsed = parseTitleMeta(raw);
            if (parsed.kind === 'contact') {
              const extraStyle: Record<string, unknown> | undefined = !emittedTitleContact
                ? { marginTop: 256 }
                : undefined;
              elements.push(
                asElement(
                  roles.titleContact,
                  '',
                  item,
                  hasTitle
                    ? {
                      ...coverPageMeta(),
                      ...(extraStyle ? { style: extraStyle } : {})
                    }
                    : (extraStyle ? { style: extraStyle } : undefined),
                  inlinePartsToElements(rawParts)
                )
              );
              emittedTitleContact = true;
            } else {
              elements.push(asElement(
                roles.titleMeta,
                '',
                item,
                hasTitle ? coverPageMeta() : undefined,
                inlinePartsToElements(rawParts)
              ));
            }
          } else {
            const marker = block.kind === 'ul' ? markerPrefix : `${orderedStart + index}. `;
            const markedParts: InlinePart[] = [];
            pushInlinePart(markedParts, marker);
            for (const part of rawParts) {
              pushInlinePart(markedParts, part.text, part.style);
            }
            elements.push(asElement(roles.action, '', item, applyCoverBreak(), inlinePartsToElements(markedParts)));
          }
        }
        break;
      }
      case 'hr':
        elements.push(asElement(roles.beat, '', block, applyCoverBreak()));
        break;
      default:
        break;
    }
  }

  return elements;
}

export const screenplayFormat: FormatModule = {
  name: 'screenplay',
  listFlavors(): string[] {
    return listFlavorNames('screenplay');
  },
  compile(document: SemanticDocument, _inputPath: string, options?: { flavor?: string }): DocumentInput {
    const flavor = loadFormatFlavor<ScreenplayFlavor>('screenplay', options?.flavor);
    const stylesByRole = createStyles(flavor);
    const production = resolveProduction(flavor);
    const layout: DocumentInput['layout'] = {
      pageSize: 'LETTER',
      margins: { top: 72, right: 72, bottom: 72, left: 108 },
      fontFamily: 'Courier Prime',
      fontSize: 12,
      lineHeight: 1,
      showPageNumbers: true,
      pageNumberFormat: '{n}.',
      pageNumberPosition: 'top',
      pageNumberAlignment: 'right',
      pageNumberOffset: 36,
      pageNumberStartPage: 2,
      pageNumberFontSize: 12,
      pageNumberColor: '#111111',
      pageNumberFont: 'Courier Prime',
      ...(flavor.layout || {})
    };

    if (production.lockedPagesEnabled) {
      const baseFormat = String(layout.pageNumberFormat || '{n}.');
      layout.pageNumberFormat = production.lockedPagesPlacement === 'prefix'
        ? `${production.lockedPagesRevisionLabel}${baseFormat}`
        : `${baseFormat}${production.lockedPagesRevisionLabel}`;
    }

    return {
      documentVersion: '1.0',
      layout,
      styles: stylesByRole,
      elements: emitBlocks(document.children, production)
    };
  }
};


