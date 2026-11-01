import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(testsDir);
const files = fs.readdirSync(testsDir)
  .filter((name) => /\.(?:cjs|mjs)$/.test(name) && name !== "run-release-suite.mjs")
  .sort();

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(testsDir, file)], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status === 0) {
    process.stdout.write(`PASS  ${file}\n`);
    continue;
  }
  failures.push(file);
  process.stdout.write(`FAIL  ${file}\n`);
  const detail = (result.stderr || result.stdout || "No diagnostic output").trim().split("\n").slice(0, 8).join("\n");
  process.stdout.write(`${detail}\n`);
}

console.log(`\nRelease suite: ${files.length - failures.length} passed, ${failures.length} failed, ${files.length} total.`);
if (failures.length) {
  console.log("Failed tests:");
  failures.forEach((file) => console.log(`- ${file}`));
  process.exitCode = 1;
}
