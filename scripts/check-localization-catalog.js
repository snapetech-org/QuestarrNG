import console from "node:console";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const failures = [];
const [
  manifestSource,
  provenanceSource,
  interfaceSource,
  localeMapSource,
  regionalFormatSource,
  apiTemplateSource,
  apiAdditionalSource,
  apiSummarySource,
] = await Promise.all([
  readFile(path.join(root, "localization/messages.json"), "utf8"),
  readFile(path.join(root, "client/src/lib/localization-provenance.json"), "utf8"),
  readFile(path.join(root, "client/src/lib/interface-locale.ts"), "utf8"),
  readFile(path.join(root, "localization/locale-map.json"), "utf8"),
  readFile(path.join(root, "client/src/lib/regional-format.ts"), "utf8"),
  readFile(path.join(root, "client/src/lib/api-error-details/templates.ts"), "utf8"),
  readFile(path.join(root, "client/src/lib/api-error-details/additional.ts"), "utf8"),
  readFile(path.join(root, "client/src/lib/api-error-locale.ts"), "utf8"),
]);
const manifest = JSON.parse(manifestSource);
const provenance = JSON.parse(provenanceSource);
const localeMap = JSON.parse(localeMapSource);
const messages = manifest.messages ?? {};
const ids = Object.keys(messages);
const idSet = new Set(ids);
const targetLanguages = manifest.targetLanguages ?? [];
const validStatuses = new Set(Object.keys(provenance.statusDefinitions ?? {}));

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

function parse(source, fileName) {
  const kind =
    fileName.endsWith(".tsx") || fileName.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return undefined;
}

function properties(object) {
  if (!ts.isObjectLiteralExpression(object)) return [];
  return object.properties
    .filter((property) => ts.isPropertyAssignment(property) && property.name)
    .map((property) => [propertyName(property.name), property.initializer])
    .filter(([name]) => typeof name === "string");
}

function constInitializer(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        return declaration.initializer;
      }
    }
  }
  return undefined;
}

if (manifest.schemaVersion !== 1 || manifest.sourceLanguage !== "en") {
  failures.push("localization/messages.json must use schema version 1 and English source text.");
}
if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
  failures.push("The stable catalog must declare at least one target locale.");
}
if (new Set(targetLanguages).size !== targetLanguages.length) {
  failures.push("The stable catalog lists a target locale more than once.");
}

const sourceToId = new Map();
for (const [id, message] of Object.entries(messages)) {
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/u.test(id)) {
    failures.push("Message ID is not a namespaced stable ID: " + id);
  }
  if (typeof message.source !== "string" || !message.source.trim()) {
    failures.push("Message source is missing for " + id);
    continue;
  }
  if (sourceToId.has(message.source)) {
    failures.push(
      "Duplicate English source text for " + id + " and " + sourceToId.get(message.source)
    );
  }
  sourceToId.set(message.source, id);
  const translations = message.translations ?? {};
  for (const locale of targetLanguages) {
    const translation = translations[locale];
    if (typeof translation !== "string" || !translation.trim()) {
      failures.push("Missing " + locale + " translation for " + id);
      continue;
    }
    if (
      JSON.stringify(placeholders(translation)) !== JSON.stringify(placeholders(message.source))
    ) {
      failures.push("Placeholder mismatch for " + id + " in " + locale);
    }
  }
  for (const locale of Object.keys(translations)) {
    if (!targetLanguages.includes(locale)) {
      failures.push("Undeclared locale " + locale + " is present for " + id);
    }
  }
}

// These examples are matching expressions/identifiers, so their tokens stay literal.
const literalExamples = {
  "interface.e_g_404_c875c07b": { tokens: ["404"], ignoreCase: false },
  "interface.e_g_ps2_c7c4bde6": { tokens: ["ps2"], ignoreCase: true },
  "interface.e_g_gog_drm_free_df026737": { tokens: ["(GOG|DRM-free)"], ignoreCase: false },
  "interface.e_g_hypervisor_cam_sample_655a5dd1": {
    tokens: ["HYPERVISOR", "CAM", "SAMPLE"],
    ignoreCase: true,
  },
  "interface.e_g_codex_skidrow_empress_50f0eff0": {
    tokens: ["CODEX", "SKIDROW", "EMPRESS"],
    ignoreCase: true,
  },
};
for (const [id, requirement] of Object.entries(literalExamples)) {
  const message = messages[id];
  if (!message) {
    failures.push("Missing matching-rule example " + id);
    continue;
  }
  for (const locale of targetLanguages) {
    const value = message.translations?.[locale];
    if (typeof value !== "string") continue;
    const normalized = requirement.ignoreCase ? value.toLowerCase() : value;
    for (const token of requirement.tokens) {
      const literal = requirement.ignoreCase ? token.toLowerCase() : token;
      if (!normalized.includes(literal)) {
        failures.push(
          "Matching-rule example changes literal " + token + " for " + id + " in " + locale
        );
      }
    }
  }
}

const interfaceAst = parse(interfaceSource, "interface-locale.ts");
const languageOptions = unwrap(constInitializer(interfaceAst, "INTERFACE_LANGUAGE_OPTIONS"));
const optionValues = ts.isArrayLiteralExpression(languageOptions)
  ? languageOptions.elements
      .map((element) => new Map(properties(unwrap(element))).get("value"))
      .filter((value) => value && ts.isStringLiteralLike(value))
      .map((value) => value.text)
  : [];
const expectedOptions = ["en", ...targetLanguages];
if (JSON.stringify(optionValues) !== JSON.stringify(expectedOptions)) {
  failures.push(
    "Interface selector locales must match English plus localization/messages.json targetLanguages in order."
  );
}

if (provenance.schemaVersion !== 2 || provenance.checksumAlgorithm !== "fnv1a32-utf16-code-units") {
  failures.push("Localization provenance schema or checksum algorithm is unsupported.");
}

const localeRows = Array.isArray(localeMap.locales) ? localeMap.locales : [];
const localeTags = localeRows.map((locale) => locale.tag);
const localeTagSet = new Set(localeTags);
const enabledMapTags = localeRows
  .filter((locale) => locale.availability === "source" || locale.availability === "available")
  .map((locale) => locale.tag)
  .sort();
const enabledManifestTags = ["en", ...targetLanguages].sort();
const plannedLocaleCount = localeRows.filter(
  (locale) => locale.availability === "translation-needed"
).length;
if (
  localeMap.schemaVersion !== 1 ||
  localeMap.sourceLanguage !== "en" ||
  localeMap.targetChoiceCount !== 37 ||
  localeRows.length !== localeMap.targetChoiceCount ||
  new Set(localeTags).size !== localeTags.length
) {
  failures.push("The locale rollout map must contain 37 unique choices including English.");
}
if (JSON.stringify(enabledMapTags) !== JSON.stringify(enabledManifestTags)) {
  failures.push(
    "Available locale-map entries must match English plus the complete selector catalogs."
  );
}
if (plannedLocaleCount !== localeRows.length - enabledManifestTags.length) {
  failures.push("Every locale outside the selector must be explicitly marked translation-needed.");
}
const regionalAst = parse(regionalFormatSource, "regional-format.ts");
const regionalOptions = unwrap(constInitializer(regionalAst, "REGIONAL_FORMAT_OPTIONS"));
const regionalOptionValues = ts.isArrayLiteralExpression(regionalOptions)
  ? regionalOptions.elements
      .map((element) => new Map(properties(unwrap(element))).get("value"))
      .filter((value) => value && ts.isStringLiteralLike(value))
      .map((value) => value.text)
  : [];
const regionalAliases = {
  hi: "hi-IN",
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
};
const expectedRegionalValues = localeTags.map((tag) => regionalAliases[tag] ?? tag);
if (
  new Set(regionalOptionValues).size !== regionalOptionValues.length ||
  !regionalOptionValues.includes("system") ||
  expectedRegionalValues.some((value) => !regionalOptionValues.includes(value)) ||
  regionalOptionValues.length !== expectedRegionalValues.length + 1
) {
  failures.push(
    "Regional-format options must include browser settings and one entry for every mapped locale, using documented script/region aliases."
  );
}
for (const locale of localeRows) {
  if (locale.availability === "source" && locale.tag !== "en") {
    failures.push("Only English may be marked as the source locale.");
  }
  if (locale.availability === "translation-needed" && !locale.reviewStatus) {
    failures.push("Planned locale " + locale.tag + " needs a review-status marker.");
  }
  if (locale.reviewStatus === "inherited") {
    if (!locale.translationSource || !enabledManifestTags.includes(locale.translationSource)) {
      failures.push(
        "Inherited locale " + locale.tag + " must identify an enabled translation source."
      );
    }
  }
}
const apiTemplateAst = parse(apiTemplateSource, "api-error-templates.ts");
const apiAliasProperties = properties(
  unwrap(constInitializer(apiTemplateAst, "API_ERROR_CATALOG_ALIASES"))
);
const apiAliases = Object.fromEntries(
  apiAliasProperties.map(([tag, value]) => [
    tag,
    ts.isStringLiteralLike(value) ? value.text : undefined,
  ])
);
const inheritedAliases = Object.fromEntries(
  localeRows
    .filter((row) => row.reviewStatus === "inherited")
    .map((row) => [row.tag, row.translationSource])
);
if (
  JSON.stringify(Object.entries(apiAliases).sort()) !==
  JSON.stringify(Object.entries(inheritedAliases).sort())
) {
  failures.push("API catalog aliases must match every declared inherited locale parent.");
}
for (const [name, source] of [
  ["api-error-templates.ts", apiTemplateSource],
  ["api-error-additional.ts", apiAdditionalSource],
  ["api-error-locale.ts", apiSummarySource],
]) {
  const ast = parse(source, name);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "indexOf" &&
      ["API_ERROR_DETAIL_LOCALE_ORDER", "LOCALE_ORDER"].includes(
        node.expression.expression.getText(ast)
      )
    ) {
      const argument = node.arguments[0];
      if (
        !argument ||
        !ts.isCallExpression(argument) ||
        argument.expression.getText(ast) !== "getApiErrorCatalogLocale"
      )
        failures.push(name + " must normalize inherited aliases before API catalog index lookup.");
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
const fallbackReferences = [
  localeMap.regionalFallbacks?.es?.default,
  localeMap.regionalFallbacks?.es?.latinAmerica,
  ...Object.values(localeMap.regionalFallbacks?.fr?.regions ?? {}),
  localeMap.regionalFallbacks?.pt?.default,
  ...Object.values(localeMap.regionalFallbacks?.pt?.regions ?? {}),
  localeMap.regionalFallbacks?.pt?.unavailableFallback,
  localeMap.regionalFallbacks?.zh?.default,
  ...Object.values(localeMap.regionalFallbacks?.zh?.script ?? {}),
  ...Object.values(localeMap.regionalFallbacks?.zh?.regions ?? {}),
].filter(Boolean);
for (const fallback of fallbackReferences) {
  if (!localeTagSet.has(fallback)) {
    failures.push(
      "Regional fallback references a locale missing from localization/locale-map.json: " + fallback
    );
  }
}
if (!validStatuses.has(provenance.defaultStatus)) {
  failures.push("The provenance defaultStatus is not defined.");
}
const provenanceMessages = provenance.messages ?? {};
for (const id of ids) {
  const record = provenanceMessages[id];
  if (!record) {
    failures.push("Missing provenance source checksum for " + id);
    continue;
  }
  if (record.sourceChecksum !== checksum(messages[id].source)) {
    failures.push(
      "Source changed for " + id + "; review translations and update its provenance checksum."
    );
  }
  const translationStatuses = record.translations ?? {};
  const translationSources = record.translationSources ?? {};
  // Runtime UI/service lookups index aliases directly, so every inherited locale
  // must keep its parent metadata and materialized parent value for every ID.
  for (const locale of localeRows.filter((row) => row.reviewStatus === "inherited")) {
    if (
      translationStatuses[locale.tag] !== "inherited" ||
      translationSources[locale.tag] !== locale.translationSource
    ) {
      failures.push(
        "Inherited locale " +
          locale.tag +
          " must retain its declared parent " +
          locale.translationSource +
          " for " +
          id +
          "."
      );
    }
  }
  for (const [locale, status] of Object.entries(translationStatuses)) {
    if (!targetLanguages.includes(locale)) {
      failures.push("Provenance locale " + locale + " is not declared for " + id);
    }
    if (!validStatuses.has(status)) {
      failures.push(
        "Unknown translation provenance status " + status + " for " + id + " (" + locale + ")."
      );
    }
    if (status === "source-fallback" && messages[id].translations[locale] !== messages[id].source) {
      failures.push("English source fallback differs from its source for " + id + " in " + locale);
    }
    if (status === "inherited") {
      const parent = translationSources[locale];
      if (!parent || !targetLanguages.includes(parent)) {
        failures.push(
          "Inherited translation " + id + " (" + locale + ") must name a supported parent locale."
        );
      } else if (messages[id].translations[locale] !== messages[id].translations[parent]) {
        failures.push(
          "Inherited translation " +
            id +
            " (" +
            locale +
            ") must match its recorded parent " +
            parent +
            "."
        );
      }
    }
  }
  for (const [locale, parent] of Object.entries(translationSources)) {
    if (translationStatuses[locale] !== "inherited") {
      failures.push(
        "Translation source for " + id + " (" + locale + ") requires inherited provenance."
      );
    }
    if (!targetLanguages.includes(parent)) {
      failures.push(
        "Translation source " +
          parent +
          " for " +
          id +
          " (" +
          locale +
          ") is not a supported locale."
      );
    }
  }
}
for (const id of Object.keys(provenanceMessages)) {
  if (!idSet.has(id)) failures.push("Orphaned localization provenance entry: " + id);
}

const generator = spawnSync(
  process.execPath,
  ["scripts/generate-localization-catalog.js", "--check"],
  { cwd: root, encoding: "utf8" }
);
if (generator.status !== 0) {
  failures.push(
    (generator.stdout + generator.stderr).trim() || "Generated localization catalogs are stale."
  );
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") return [];
        return sourceFiles(filePath);
      }
      if (!/\.(?:ts|tsx|js|jsx)$/u.test(entry.name) || /\.(?:test|spec)\./u.test(entry.name)) {
        return [];
      }
      return [filePath];
    })
  );
  return nested.flat();
}

const localizedCalls = new Set([
  "t",
  "formatInterfaceMessage",
  "formatInterfaceMessageById",
  "translateInterfaceMessage",
  "translateInterfaceLabel",
  "getInterfaceTextLanguage",
  "getInterfaceTextDirection",
  "localizedText",
  "translateText",
  "languageFor",
  "directionFor",
]);
for (const filePath of await sourceFiles(path.join(root, "client/src"))) {
  const source = await readFile(filePath, "utf8");
  const sourceFile = parse(source, filePath);
  const relativePath = path.relative(root, filePath);
  const physicalInlineLayout =
    /(?<![A-Za-z0-9_-])(?:-?ml-[^\s"'\x60<>]+|-?mr-[^\s"'\x60<>]+|-?pl-[^\s"'\x60<>]+|-?pr-[^\s"'\x60<>]+|text-(?:left|right)|border-[lr](?:-[^\s"'\x60<>]+)?|rounded-[lr](?:-[^\s"'\x60<>]+)?)(?=$|[\s"'\x60<>])/gu;
  for (const match of source.matchAll(physicalInlineLayout)) {
    const position = sourceFile.getLineAndCharacterOfPosition(match.index ?? 0);
    failures.push(
      relativePath +
        ":" +
        (position.line + 1) +
        " uses a physical inline layout utility; use a logical start/end utility."
    );
  }
  const physicalPosition =
    /(?<![A-Za-z0-9_-])(-?)(left|right)-(?:([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?)|(\[[^\]]+\])|(full|auto))(?=$|[\s"'\x60<>])/gu;
  for (const match of source.matchAll(physicalPosition)) {
    const value = match[3] ?? match[4] ?? match[5];
    if (value === "1/2" || value === "[50%]") continue;
    const position = sourceFile.getLineAndCharacterOfPosition(match.index ?? 0);
    failures.push(
      relativePath +
        ":" +
        (position.line + 1) +
        " uses a physical inline position; use start/end or document a centered anchor."
    );
  }
  const checkReference = (node) => {
    if (ts.isStringLiteralLike(node) && sourceToId.has(node.text)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      failures.push(
        path.relative(root, filePath) +
          ":" +
          (position.line + 1) +
          " still uses English catalog text as a message key; use " +
          sourceToId.get(node.text)
      );
    }
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : "";
      if (localizedCalls.has(callee) && node.arguments[0]) {
        checkReference(unwrap(node.arguments[0]));
      }
      if (
        [
          "formatInterfacePluralMessage",
          "formatRegionalPluralMessage",
          "formatInterfaceSelectMessage",
        ].includes(callee) &&
        node.arguments[1] &&
        ts.isObjectLiteralExpression(node.arguments[1])
      ) {
        for (const [, value] of properties(node.arguments[1])) checkReference(value);
      }
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText(sourceFile);
        if (name === "source" || /^data-i18n-(?:title|placeholder|aria-label|alt)$/u.test(name)) {
          if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
            checkReference(attribute.initializer);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (failures.length > 0) {
  for (const failure of [...new Set(failures)]) console.error("Localization check: " + failure);
  process.exitCode = 1;
} else {
  console.log(
    "Localization catalog checked: " +
      ids.length +
      " stable IDs, " +
      targetLanguages.length +
      " complete target locales; " +
      plannedLocaleCount +
      " more mapped toward the 37-choice target."
  );
}
