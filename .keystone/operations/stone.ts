#!/usr/bin/env node
/**
 * Keystone operations entry point.
 *
 *   bun .keystone/operations/stone.ts <command> [options]
 *   node .keystone/operations/stone.ts <command> [options]   (Node >= 22.18)
 *   .keystone/bin/keystone stone <command> [options]          (portable shim)
 */

import { run } from "./cli.ts";

// A reader that stops early (`keystone stone search x | head -1`) is not an error.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

process.exitCode = run(process.argv.slice(2), {
  cwd: process.cwd(),
  io: {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  },
});
