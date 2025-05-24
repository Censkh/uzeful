#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { program } from "commander";
import { Project, SyntaxKind } from "ts-morph";

program.name("uze");

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"));
program.version(packageJson.version);

program
  .command("generate")
  .argument("<entry>", "Path to application entry")
  .description("Generate OpenAPI spec from a uze application")
  .action(async (entry, options) => {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(entry);
    const uzeImport = sourceFile.getImportDeclaration("uze");
    if (!uzeImport) {
      console.error("uze import not found");
      process.exit(1);
    }

    for (const callExpression of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const entryExpression = callExpression
        .getChildrenOfKind(SyntaxKind.Identifier)
        .find((id) => id.getText() === "openApiEntry");
      if (entryExpression) {
        console.log(entryExpression.getDefinitions());
      }
    }
  });

program.parse(process.argv);
