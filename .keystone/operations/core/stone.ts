/**
 * Stone model: conversion between raw frontmatter data and typed metadata,
 * plus file read/write helpers that preserve the Markdown body untouched.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, sep } from "node:path";
import { parseFrontmatter, splitDocument, stringifyFrontmatter } from "./frontmatter.ts";
import { KeystoneError, RELATION_KINDS } from "../types.ts";
import type { FrontmatterData, Relations, Stone, StoneMeta } from "../types.ts";

export const STONE_FILE_PATTERN = /^\.stone\.([a-z0-9][a-z0-9-]*)\.md$/;
export const STONE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const KNOWN_KEYS = ["id", "type", "tags", "relations", "owner", "summary"];

export function stoneFileName(id: string): string {
  return `.stone.${id}.md`;
}

export function emptyRelations(): Relations {
  return { depends_on: [], depended_by: [], children: [] };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value !== "") return [value];
  return [];
}

/** Converts raw frontmatter data into typed stone metadata. */
export function toMeta(data: FrontmatterData): StoneMeta {
  const relations = emptyRelations();
  const rawRelations = data.relations;
  const extra: FrontmatterData = {};
  if (rawRelations && typeof rawRelations === "object" && !Array.isArray(rawRelations)) {
    for (const [kind, targets] of Object.entries(rawRelations)) {
      if ((RELATION_KINDS as readonly string[]).includes(kind)) {
        relations[kind as keyof Relations] = [...targets];
      }
    }
  }
  for (const [key, value] of Object.entries(data)) {
    if (!KNOWN_KEYS.includes(key)) extra[key] = value;
  }
  const owner = asString(data.owner);
  return {
    id: asString(data.id),
    type: asString(data.type),
    tags: asList(data.tags),
    relations,
    owner: owner === "" ? undefined : owner,
    summary: asString(data.summary),
    extra,
  };
}

/** Returns the unknown relation kinds declared in raw data (reported by `doctor`). */
export function unknownRelationKinds(data: FrontmatterData): string[] {
  const raw = data.relations;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.keys(raw).filter((kind) => !(RELATION_KINDS as readonly string[]).includes(kind));
}

/** Converts typed metadata back into canonically ordered frontmatter data. */
export function fromMeta(meta: StoneMeta): FrontmatterData {
  const data: FrontmatterData = {
    id: meta.id,
    type: meta.type,
    tags: meta.tags,
    relations: {
      depends_on: meta.relations.depends_on,
      depended_by: meta.relations.depended_by,
      children: meta.relations.children,
    },
  };
  if (meta.owner) data.owner = meta.owner;
  data.summary = meta.summary;
  return { ...data, ...meta.extra };
}

export function renderStone(meta: StoneMeta, body: string): string {
  const frontmatter = stringifyFrontmatter(fromMeta(meta), KNOWN_KEYS);
  const content = `---\n${frontmatter}\n---\n${body}`;
  return content.endsWith("\n") ? content : `${content}\n`;
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export interface RawStone {
  data: FrontmatterData;
  stone: Stone;
}

/** Reads and parses a stone file. Throws `FrontmatterError` on malformed input. */
export function readStone(path: string, root: string): RawStone {
  const source = readFileSync(path, "utf8");
  const { frontmatter, body, offset } = splitDocument(source);
  const data = parseFrontmatter(frontmatter, offset);
  const relPath = toPosix(relative(root, path));
  const relDir = toPosix(relative(root, dirname(path))) || ".";
  const match = STONE_FILE_PATTERN.exec(basename(path));
  const notes = unknownRelationKinds(data).map((kind) => `unknown relation kind '${kind}'`);
  if (data.relations !== undefined && (typeof data.relations !== "object" || Array.isArray(data.relations))) {
    notes.push("'relations' must be a map of lists");
  }
  for (const key of ["id", "type", "summary", "owner"]) {
    if (data[key] !== undefined && typeof data[key] !== "string") notes.push(`'${key}' must be a scalar`);
  }
  return {
    data,
    stone: {
      meta: toMeta(data),
      body,
      path,
      relPath,
      relDir,
      fileId: match ? match[1] : "",
      notes,
    },
  };
}

export function writeStone(stone: Stone): void {
  if (stone.notes.length > 0) {
    throw new KeystoneError(
      `refusing to rewrite ${stone.relPath}: ${stone.notes.join("; ")}. Fix the frontmatter by hand first (see 'keystone stone doctor').`,
    );
  }
  writeFileSync(stone.path, renderStone(stone.meta, stone.body), "utf8");
}

export function titleFromId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Extracts Markdown headings (used by search scoring). */
export function headings(body: string): string[] {
  return body
    .split("\n")
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim());
}
