import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const failures = [];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function unwrap(node) {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function getConstInitializer(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        return unwrap(declaration.initializer);
      }
    }
  }
  throw new Error("Could not find " + name + " in " + sourceFile.fileName);
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function properties(object) {
  if (!ts.isObjectLiteralExpression(object)) return [];
  return object.properties
    .filter((property) => ts.isPropertyAssignment(property) && property.name)
    .map((property) => [propertyName(property.name), unwrap(property.initializer)])
    .filter(([name]) => typeof name === "string");
}

function literalString(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function checksum(source) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193);
  }
  return "fnv1a32:" + (hash >>> 0).toString(16).padStart(8, "0");
}

function placeholders(value) {
  return Array.from(value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu), (match) => match[1]).sort();
}

const [labelsSource, interfaceSource, stableSource, provenanceSource] = await Promise.all([
  read("client/src/lib/ui-labels.ts"),
  read("client/src/lib/interface-locale.ts"),
  read("client/src/lib/stable-interface-messages.ts"),
  read("client/src/lib/localization-provenance.json"),
]);

const labelsAst = parse(labelsSource, "ui-labels.ts");
const interfaceAst = parse(interfaceSource, "interface-locale.ts");
const stableAst = parse(stableSource, "stable-interface-messages.ts");
const labelsNode = getConstInitializer(labelsAst, "UI_LABELS");
const optionsNode = getConstInitializer(interfaceAst, "INTERFACE_LANGUAGE_OPTIONS");
const stableNode = getConstInitializer(stableAst, "STABLE_INTERFACE_MESSAGES");
const catalog = new Map();

for (const [source, translationsNode] of properties(labelsNode)) {
  const translations = new Map(
    properties(translationsNode).map(([locale, value]) => [locale, literalString(value)])
  );
  catalog.set(source, translations);
}

const localeOptions = ts.isArrayLiteralExpression(optionsNode)
  ? optionsNode.elements.map((element) => {
      const values = new Map(
        properties(unwrap(element)).map(([key, value]) => [key, literalString(value)])
      );
      return values.get("value");
    }).filter((value) => typeof value === "string")
  : [];
const languages = localeOptions.filter((locale) => locale !== "en");
if (languages.length === 0) failures.push("No non-English interface locales were found.");

for (const [source, translations] of catalog) {
  const expected = JSON.stringify(placeholders(source));
  for (const locale of languages) {
    const translation = translations.get(locale);
    if (typeof translation !== "string" || !translation.trim()) {
      failures.push("Missing " + locale + " translation for " + JSON.stringify(source));
      continue;
    }
    if (JSON.stringify(placeholders(translation)) !== expected) {
      failures.push("Placeholder mismatch for " + JSON.stringify(source) + " in " + locale);
    }
  }
}

let provenance;
try {
  provenance = JSON.parse(provenanceSource);
} catch (error) {
  throw new Error("Invalid localization provenance JSON: " + String(error));
}
const validStatuses = new Set(Object.keys(provenance.statusDefinitions ?? {}));
if (!validStatuses.has(provenance.defaultStatus)) {
  failures.push("The provenance default status is not defined.");
}

const stableMessages = new Map(
  properties(stableNode).map(([id, value]) => [id, literalString(value)])
);
const metadata = provenance.messages ?? {};
for (const [id, source] of stableMessages) {
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/u.test(id)) {
    failures.push("Stable message ID is not namespaced: " + id);
  }
  if (typeof source !== "string" || !catalog.has(source)) {
    failures.push("Stable message source is absent from the legacy catalog: " + id);
    continue;
  }
  const entry = metadata[id];
  if (!entry) {
    failures.push("Missing provenance metadata for " + id);
    continue;
  }
  if (entry.sourceChecksum !== checksum(source)) {
    failures.push(
      "Source checksum is stale for " +
        id +
        "; update provenance after reviewing translations."
    );
  }
  for (const locale of languages) {
    const status = entry.translations?.[locale] ?? provenance.defaultStatus;
    if (!validStatuses.has(status)) {
      failures.push("Unknown provenance status " + status + " for " + id + " / " + locale);
    }
  }
}
for (const id of Object.keys(metadata)) {
  if (!stableMessages.has(id)) failures.push("Orphaned provenance entry: " + id);
}

if (failures.length) {
  for (const failure of failures) console.error("localization: " + failure);
  process.exitCode = 1;
} else {
  console.log(
    "Localization catalog OK: " +
      catalog.size +
      " source strings, " +
      languages.length +
      " complete target locales, " +
      stableMessages.size +
      " stable IDs with provenance."
  );
}
