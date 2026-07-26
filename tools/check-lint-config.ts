#!/usr/bin/env tsx
/**
 * Verifies that the Biome lint gate rejects bad code.
 *
 * Creates a temporary .ts fixture with debugger and unreachable code,
 * runs the project-local Biome binary with the repo config, and
 * asserts non-zero exit + both noDebugger and noUnreachable diagnostics.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BIOME_BIN = join(import.meta.dirname ?? __dirname, "..", "node_modules", ".bin", "biome");
const BIOME_CONFIG = join(import.meta.dirname ?? __dirname, "..", "biome.json");

// Guard: project-local binary must exist
if (!existsSync(BIOME_BIN)) {
  console.error(`Biome binary not found at ${BIOME_BIN}`);
  process.exit(1);
}
if (!existsSync(BIOME_CONFIG)) {
  console.error(`Biome config not found at ${BIOME_CONFIG}`);
  process.exit(1);
}

const tmpDir = mkdtempSync(join(tmpdir(), "biome-lint-check-"));
try {
  const fixturePath = join(tmpDir, "bad-fixture.ts");

  writeFileSync(
    fixturePath,
    [
      "function bad(): number {",
      "  debugger;",
      '  throw new Error("stop");',
      "  return 42; // unreachable",
      "}",
      "",
    ].join("\n"),
    "utf-8",
  );

  let exitCode = 0;
  let stdout = "";
  try {
    stdout = execFileSync(
      BIOME_BIN,
      ["lint", `--config-path=${BIOME_CONFIG}`, fixturePath],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    exitCode = e.status ?? 1;
    stdout = (e.stdout ?? "") + (e.stderr ?? "");
  }

  // Assertions
  let failures = 0;

  if (exitCode === 0) {
    console.error("FAIL: Biome lint exited 0 on bad fixture (expected non-zero)");
    failures++;
  } else {
    console.log("PASS: Biome lint exited non-zero on bad fixture");
  }

  const hasNoDebugger = stdout.includes("noDebugger");
  if (hasNoDebugger) {
    console.log("PASS: output includes noDebugger diagnostic");
  } else {
    console.error("FAIL: output does not include noDebugger diagnostic");
    failures++;
  }

  const hasNoUnreachable = stdout.includes("noUnreachable");
  if (hasNoUnreachable) {
    console.log("PASS: output includes noUnreachable diagnostic");
  } else {
    console.error("FAIL: output does not include noUnreachable diagnostic");
    failures++;
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll lint config checks passed");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
