import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const directory = new URL("./", import.meta.url);
const tests = readdirSync(directory).filter(name => /^test-.*\.mjs$/.test(name)).sort();
if (!tests.length) throw new Error("No database regression tests found");
for (const name of tests) {
  console.log(`\nRunning ${name}`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(name, directory))], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`\nAll ${tests.length} database regression suites passed.`);
