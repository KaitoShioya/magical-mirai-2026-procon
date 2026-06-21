// 依存規則（docs/decisions/architecture.md §5、src/scoring/README.md）の静的検査。
// 判定の各ソースが禁止依存（profiles・rendering・tools の各ディレクトリと three.js 本体）を参照しないことを、
// 実装時に機械的に保証する。本文全体の文字列検索では注釈や識別子名の偶然の一致で誤検知するおそれがあるため、
// 依存先を指す指定子だけを取り出して経路で判定する。config（共有設定）は許可するため禁止根に含めない。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scoringDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(scoringDir, "..");

/** 判定ディレクトリ配下の、テストでない TypeScript ソースの絶対パスを集める。 */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

/** ソースから依存先を指す指定子を抽出する。通常import・再輸出・副作用import・動的importの4種を対象にする。 */
function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns: RegExp[] = [
    /\bimport\b[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bexport\b[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/** 指定子が禁止依存を指すかを判定する。three 本体と、profiles・rendering・tools 配下を違反とする。 */
function isForbidden(specifier: string, fromFile: string): boolean {
  if (specifier === "three" || specifier.startsWith("three/")) {
    return true;
  }
  if (specifier.startsWith(".")) {
    const resolved = resolve(dirname(fromFile), specifier).replace(/\\/g, "/");
    const forbiddenRoots = ["profiles", "rendering", "tools"].map((name) =>
      join(srcDir, name).replace(/\\/g, "/")
    );
    return forbiddenRoots.some((root) => resolved === root || resolved.startsWith(`${root}/`));
  }
  return false;
}

describe("判定の依存境界", () => {
  const sources = collectSourceFiles(scoringDir);

  it("検査対象のソースが1つ以上ある", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("禁止依存（profiles・rendering・tools・three.js）を参照しない", () => {
    const violations: string[] = [];
    for (const file of sources) {
      const source = readFileSync(file, "utf8");
      for (const specifier of extractSpecifiers(source)) {
        if (isForbidden(specifier, file)) {
          violations.push(`${file} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
