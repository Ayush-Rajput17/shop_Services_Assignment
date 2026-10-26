/**
 * Task 1 - build this.
 *
 * Walk every .ts file under src/modules and look at its imports.
 * A module may import:
 *   - its own files
 *   - anything under src/platform
 *   - another module's index.ts  -  and nothing else
 *
 * Anything else is a violation.
 *
 * Running this file directly should print the violations and exit 1 when
 * there are any, 0 when there are none.
 *
 * No dependencies. node:fs and node:path are enough. Remember that a
 * type-only import still couples one module to another.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface Violation {
  file: string;
  importPath: string;
  reason: string;
}


function getImportPaths(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  const patterns = [
    /\bimport\s*(['"])([^'"\n]+)\1/g,
    /\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s*(['"])([^'"\n]+)\1/g,
    /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s*(['"])([^'"\n]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
  ];

  const imports: string[] = [];

  for (const pattern of patterns) {
    for (const match of withoutComments.matchAll(pattern)) {
      imports.push(match[2]!);
    }
  }

  return [...new Set(imports)];
}

/** Recursively find every .ts file inside a directory. */
function walkTypeScriptFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}


function resolveTypeScriptImport(
  importer: string,
  importPath: string,
): string | undefined {
  if (!importPath.startsWith(".")) {
    return undefined;
  }

  const base = path.resolve(path.dirname(importer), importPath);

  const candidates = path.extname(base)
    ? [base]
    : [`${base}.ts`, path.join(base, "index.ts")];

  return candidates.find(
    (candidate) =>
      fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
}

function isInsideDirectory(
  directory: string,
  target: string,
): boolean {
  const relative = path.relative(directory, target);

  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

export function findViolations(root: string): Violation[] {
  const srcRoot = path.resolve(root);
  const modulesRoot = path.join(srcRoot, "modules");
  const platformRoot = path.join(srcRoot, "platform");
  const violations: Violation[] = [];

  for (const file of walkTypeScriptFiles(modulesRoot)) {
    const relativeFile = path
      .relative(srcRoot, file)
      .split(path.sep)
      .join("/");

    const relativeToModules = path.relative(modulesRoot, file);
    const currentModule = relativeToModules.split(path.sep)[0];

    for (const importPath of getImportPaths(
      fs.readFileSync(file, "utf8"),
    )) {
      const target = resolveTypeScriptImport(file, importPath);
      let reason: string | undefined;

      if (!target) {
        reason = importPath.startsWith(".")
          ? "Import does not resolve to a TypeScript file"
          : "Module imports must use a relative path to an allowed local file";
      } else {
        const relativeTarget = path.relative(modulesRoot, target);
        const targetParts = relativeTarget.split(path.sep);
        const targetModule = targetParts[0];

        const isOwnFile =
          isInsideDirectory(
            path.join(modulesRoot, currentModule!),
            target,
          );

        const isPlatformFile =
          isInsideDirectory(platformRoot, target);

        const isOtherModuleIndex =
          isInsideDirectory(modulesRoot, target) &&
          targetParts.length === 2 &&
          targetModule !== currentModule &&
          targetParts[1] === "index.ts";

        if (isOwnFile || isPlatformFile || isOtherModuleIndex) {
          continue;
        }

        reason =
          "A module may import only its own files, src/platform, or another module's index.ts";
      }

      violations.push({
        file: relativeFile,
        importPath,
        reason,
      });
    }
  }

  return violations;
}


const invokedFile = process.argv[1]
  ? path.resolve(process.argv[1])
  : "";

const thisFile = path.resolve(fileURLToPath(import.meta.url));

if (invokedFile === thisFile) {
  const root = path.resolve(path.dirname(thisFile), "../src");
  const violations = findViolations(root);

  if (violations.length === 0) {
    console.log("No module boundary violations found.");
    process.exitCode = 0;
  } else {
    console.error("Module boundary violations found:");

    for (const violation of violations) {
      console.error(
        `  ${violation.file} -> ${violation.importPath}: ${violation.reason}`,
      );
    }

    process.exitCode = 1;
  }
}

