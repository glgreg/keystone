/**
 * Shared types for Keystone operations.
 *
 * A Stone is a co-located context node (`.stone.<id>.md`) composed of a
 * constrained YAML frontmatter (machine-readable contract) and a free
 * Markdown body (human/agent-readable rationale).
 */

export const STONE_TYPES = ["module", "service", "entity", "policy", "integration"] as const;
export type StoneType = (typeof STONE_TYPES)[number];

export const RELATION_KINDS = ["depends_on", "depended_by", "children"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

/** Inverse relation kept in sync by `relate` and `doctor --fix`. `children` has no stored inverse. */
export const INVERSE_RELATION: Partial<Record<RelationKind, RelationKind>> = {
  depends_on: "depended_by",
  depended_by: "depends_on",
};

export type Relations = Record<RelationKind, string[]>;

/** Values supported by the constrained frontmatter dialect. */
export type FrontmatterValue = string | string[] | Record<string, string[]>;
export type FrontmatterData = Record<string, FrontmatterValue>;

export interface StoneMeta {
  id: string;
  type: string;
  tags: string[];
  relations: Relations;
  owner?: string;
  summary: string;
  /** Unknown keys are preserved verbatim on rewrite. */
  extra: FrontmatterData;
}

export interface Stone {
  meta: StoneMeta;
  body: string;
  /** Absolute path of the stone file. */
  path: string;
  /** Path relative to the project root, POSIX separators. */
  relPath: string;
  /** Directory relative to the project root, POSIX separators ("." for root). */
  relDir: string;
  /** Identifier derived from the filename (`.stone.<id>.md`). */
  fileId: string;
  /** Non-fatal parse observations (e.g. unknown relation kinds), reported by `doctor`. */
  notes: string[];
}

export interface ParseIssue {
  path: string;
  relPath: string;
  message: string;
}

export interface ScanResult {
  root: string;
  stones: Stone[];
  parseIssues: ParseIssue[];
}

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  stone?: string;
  path?: string;
  fixable?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: RelationKind;
}

export interface Graph {
  nodes: Map<string, Stone>;
  edges: GraphEdge[];
}

export class KeystoneError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "KeystoneError";
    this.exitCode = exitCode;
  }
}
