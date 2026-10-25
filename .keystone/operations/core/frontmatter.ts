/**
 * Constrained YAML frontmatter dialect.
 *
 * Keystone intentionally supports a small, predictable subset of YAML so that
 * stones stay trivially parseable by any tool (or agent) without third-party
 * dependencies:
 *
 *   key: scalar                 # plain, 'single' or "double" quoted
 *   key: [a, b]                 # inline list
 *   key:                        # block list
 *     - a
 *   key:                        # map of lists (used by `relations`)
 *     sub: [a]
 *     other:
 *       - b
 *   key: >                      # folded (or `|` literal) block scalar
 *     long text
 *
 * Anything outside this subset is reported as a parse error with a line number
 * instead of being silently misread.
 */

import type { FrontmatterData, FrontmatterValue } from "../types.ts";

export interface SplitDocument {
  frontmatter: string;
  body: string;
  /** 1-based line number where the frontmatter content starts. */
  offset: number;
}

export class FrontmatterError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(line > 0 ? `line ${line}: ${message}` : message);
    this.name = "FrontmatterError";
    this.line = line;
  }
}

const KEY_PATTERN = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/;

/** Splits a document into its frontmatter block and Markdown body. */
export function splitDocument(source: string): SplitDocument {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---\n")) {
    throw new FrontmatterError("missing opening '---' frontmatter delimiter", 1);
  }
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      return {
        frontmatter: lines.slice(1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
        offset: 2,
      };
    }
  }
  throw new FrontmatterError("missing closing '---' frontmatter delimiter", lines.length);
}

function indentOf(line: string): number {
  const match = /^( *)/.exec(line);
  return match ? match[1].length : 0;
}

function isSkippable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

function stripInlineComment(value: string): string {
  const index = value.search(/\s#/);
  return index === -1 ? value : value.slice(0, index);
}

/** Parses a scalar token (plain or quoted). */
export function parseScalar(raw: string, line: number): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    const end = value.lastIndexOf('"');
    if (end <= 0) throw new FrontmatterError("unterminated double-quoted string", line);
    try {
      return JSON.parse(value.slice(0, end + 1)) as string;
    } catch {
      throw new FrontmatterError("invalid double-quoted string", line);
    }
  }
  if (value.startsWith("'")) {
    const end = value.lastIndexOf("'");
    if (end <= 0) throw new FrontmatterError("unterminated single-quoted string", line);
    return value.slice(1, end).replace(/''/g, "'");
  }
  return stripInlineComment(value).trim();
}

function splitInlineList(inner: string, line: number): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ",") {
      items.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (quote) throw new FrontmatterError("unterminated quoted item in inline list", line);
  items.push(current);
  return items.map((item) => parseScalar(item, line)).filter((item) => item !== "");
}

/** Parses an inline list (`[a, b]`). Returns null when the value is not a list. */
export function parseInlineList(raw: string, line: number): string[] | null {
  const value = stripInlineComment(raw).trim();
  if (!value.startsWith("[")) return null;
  if (!value.endsWith("]")) throw new FrontmatterError("unterminated inline list", line);
  return splitInlineList(value.slice(1, -1), line);
}

interface Cursor {
  lines: string[];
  index: number;
  offset: number;
}

function lineNumber(cursor: Cursor, index = cursor.index): number {
  return cursor.offset + index;
}

function nextContentIndex(cursor: Cursor, from: number): number {
  let i = from;
  while (i < cursor.lines.length && isSkippable(cursor.lines[i])) i++;
  return i;
}

function parseBlockList(cursor: Cursor, indent: number): string[] {
  const items: string[] = [];
  while (true) {
    const i = nextContentIndex(cursor, cursor.index);
    if (i >= cursor.lines.length) {
      cursor.index = i;
      break;
    }
    const line = cursor.lines[i];
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      throw new FrontmatterError("unexpected indentation inside list", lineNumber(cursor, i));
    }
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) break;
    const item = trimmed.slice(1);
    if (item !== "" && !item.startsWith(" ")) {
      throw new FrontmatterError("list items must use '- value'", lineNumber(cursor, i));
    }
    const value = parseScalar(item, lineNumber(cursor, i));
    if (value !== "") items.push(value);
    cursor.index = i + 1;
  }
  return items;
}

function parseBlockScalar(cursor: Cursor, style: string, parentIndent: number): string {
  const collected: string[] = [];
  let blockIndent = -1;
  while (cursor.index < cursor.lines.length) {
    const line = cursor.lines[cursor.index];
    if (line.trim() === "") {
      collected.push("");
      cursor.index++;
      continue;
    }
    const lineIndent = indentOf(line);
    if (lineIndent <= parentIndent) break;
    if (blockIndent === -1) blockIndent = lineIndent;
    collected.push(line.slice(Math.min(blockIndent, lineIndent)));
    cursor.index++;
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();
  if (style.startsWith("|")) return collected.join("\n");
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const entry of collected) {
    if (entry === "") {
      if (current.length > 0) paragraphs.push(current.join(" "));
      current = [];
    } else {
      current.push(entry.trim());
    }
  }
  if (current.length > 0) paragraphs.push(current.join(" "));
  return paragraphs.join("\n");
}

function parseNestedMap(cursor: Cursor, indent: number): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  while (true) {
    const i = nextContentIndex(cursor, cursor.index);
    if (i >= cursor.lines.length) {
      cursor.index = i;
      break;
    }
    const line = cursor.lines[i];
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      throw new FrontmatterError("unexpected indentation inside map", lineNumber(cursor, i));
    }
    const match = KEY_PATTERN.exec(line.trim());
    if (!match) throw new FrontmatterError("expected 'key:' inside map", lineNumber(cursor, i));
    const [, key, rawValue = ""] = match;
    if (key in map) throw new FrontmatterError(`duplicate key '${key}'`, lineNumber(cursor, i));
    cursor.index = i + 1;
    const value = stripInlineComment(rawValue).trim();
    if (value === "") {
      const next = nextContentIndex(cursor, cursor.index);
      if (next < cursor.lines.length && indentOf(cursor.lines[next]) > indent) {
        map[key] = parseBlockList(cursor, indentOf(cursor.lines[next]));
      } else {
        map[key] = [];
      }
      continue;
    }
    const list = parseInlineList(value, lineNumber(cursor, i));
    if (list === null) {
      throw new FrontmatterError(`nested key '${key}' must hold a list`, lineNumber(cursor, i));
    }
    map[key] = list;
  }
  return map;
}

/** Parses the constrained frontmatter dialect into plain data. */
export function parseFrontmatter(source: string, offset = 1): FrontmatterData {
  const cursor: Cursor = { lines: source.split("\n"), index: 0, offset };
  const data: FrontmatterData = {};
  while (true) {
    const i = nextContentIndex(cursor, cursor.index);
    if (i >= cursor.lines.length) break;
    const line = cursor.lines[i];
    if (indentOf(line) !== 0) {
      throw new FrontmatterError("top-level keys must not be indented", lineNumber(cursor, i));
    }
    const match = KEY_PATTERN.exec(line);
    if (!match) throw new FrontmatterError("expected 'key: value'", lineNumber(cursor, i));
    const [, key, rawValue = ""] = match;
    if (key in data) throw new FrontmatterError(`duplicate key '${key}'`, lineNumber(cursor, i));
    cursor.index = i + 1;
    const value = rawValue.trim();

    if (value === "|" || value === ">" || /^[|>][+-]$/.test(value)) {
      data[key] = parseBlockScalar(cursor, value, 0);
      continue;
    }
    if (value === "") {
      const next = nextContentIndex(cursor, cursor.index);
      if (next >= cursor.lines.length || indentOf(cursor.lines[next]) === 0) {
        data[key] = "";
        continue;
      }
      const childIndent = indentOf(cursor.lines[next]);
      data[key] = cursor.lines[next].trim().startsWith("-")
        ? parseBlockList(cursor, childIndent)
        : parseNestedMap(cursor, childIndent);
      continue;
    }
    const list = parseInlineList(value, lineNumber(cursor, i));
    data[key] = list ?? parseScalar(value, lineNumber(cursor, i));
  }
  return data;
}

const PLAIN_SAFE = /^[A-Za-z0-9_./@()][^\n]*$/;
const RESERVED = /^(true|false|yes|no|on|off|null|~|-?\d[\d_.]*)$/i;

/** Formats a scalar, quoting only when required to round-trip safely. */
export function formatScalar(value: string): string {
  const needsQuotes =
    value === "" ||
    value !== value.trim() ||
    !PLAIN_SAFE.test(value) ||
    RESERVED.test(value) ||
    value.includes(": ") ||
    value.endsWith(":") ||
    /\s#/.test(value) ||
    value.includes("\n");
  return needsQuotes ? JSON.stringify(value) : value;
}

const INLINE_ITEM = /^[A-Za-z0-9_./@-][A-Za-z0-9_./@ -]*$/;
const INLINE_MAX_WIDTH = 80;

function formatList(key: string, items: string[], indent: string): string[] {
  if (items.length === 0) return [`${indent}${key}: []`];
  const inline = `${indent}${key}: [${items.join(", ")}]`;
  const simple = items.every((item) => INLINE_ITEM.test(item) && item === item.trim() && !RESERVED.test(item));
  if (simple && inline.length <= INLINE_MAX_WIDTH) return [inline];
  return [`${indent}${key}:`, ...items.map((item) => `${indent}  - ${formatScalar(item)}`)];
}

/** Serializes frontmatter data with keys emitted in the given order. */
export function stringifyFrontmatter(data: FrontmatterData, order: string[] = []): string {
  const keys = [...order.filter((key) => key in data), ...Object.keys(data).filter((key) => !order.includes(key))];
  const out: string[] = [];
  for (const key of keys) {
    const value: FrontmatterValue = data[key];
    if (typeof value === "string") {
      out.push(`${key}: ${formatScalar(value)}`);
    } else if (Array.isArray(value)) {
      out.push(...formatList(key, value, ""));
    } else {
      out.push(`${key}:`);
      for (const [sub, items] of Object.entries(value)) out.push(...formatList(sub, items, "  "));
    }
  }
  return out.join("\n");
}
