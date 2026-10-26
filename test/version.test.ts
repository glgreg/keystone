import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../.keystone/operations/cli.ts";
import { REPO_ROOT } from "./helpers.ts";

test("the CLI reports the package.json version", () => {
  const { version } = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  expect(VERSION).toBe(version);
});
