#!/usr/bin/env bun
/**
 * Keystone operations entry point.
 *
 *   bun .keystone/operations/stone.ts <command> [options]
 *   node .keystone/operations/stone.ts <command> [options]   (Node >= 22.18)
 *   .keystone/bin/keystone stone <command> [options]          (portable shim)
 */

import { run } from "./cli.ts";

process.exitCode = run(process.argv.slice(2), {
  cwd: process.cwd(),
  io: {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  },
});
