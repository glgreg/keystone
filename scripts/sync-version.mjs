// Copies the package.json version into the CLI. Runs from `npm version`.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const file = ".keystone/operations/cli.ts";
const source = readFileSync(file, "utf8");
const pattern = /export const VERSION = "[^"]*";/;
if (!pattern.test(source)) throw new Error(`VERSION constant not found in ${file}`);
writeFileSync(file, source.replace(pattern, `export const VERSION = "${version}";`));
