/**
 * Command context shared by all operations.
 */

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface Context {
  /** Directory the command was invoked from. */
  cwd: string;
  /** Project root (directory holding `.keystone/`). */
  root: string;
  io: Io;
}

export type CommandResult = number;

/** Splits comma-separated CLI values (`--tags a,b`) into a clean list. */
export function csv(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`;
}
