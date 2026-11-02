import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { BUILT_IN_RULES } from "@shared/release-scoring";
import {
  RELEASE_FORMAT_FIELD_LABELS,
  RELEASE_FORMAT_MATCH_MODE_LABELS,
} from "@/lib/release-scoring-labels";
import { STABLE_INTERFACE_MESSAGES } from "@/lib/stable-interface-messages";

const catalogIds = new Set(Object.keys(STABLE_INTERFACE_MESSAGES));
const catalogSources = new Set(Object.values(STABLE_INTERFACE_MESSAGES));
const hasCatalogMessage = (reference: string) =>
  catalogIds.has(reference) || catalogSources.has(reference);

const CLIENT_SOURCE_ROOT = resolve(process.cwd(), "client/src");

// These are provider/protocol names rather than interface copy, so they stay in
// their original form in every locale.
const INTENTIONALLY_UNTRANSLATED_SOURCE_KEYS = new Set([
  "RAWG",
  "Torznab",
  "HTTP",
  "· HTTP",
  "HowLongToBeat",
  "appriseit.com/url-builder",
  "steamid.io",
  "xREL.to",
  "itch.io",
  "g4u.to",
  "&mdash;",
  "&rdquo;",
  "0",
  "https://discord.com/api/webhooks/...",
  "/path/to/library",
  "/data/library",
  "/romm/library/roms",
  "/path/to/directory",
  "/home/user/downloads",
  "/mnt/media/downloads",
  "/mnt/old-library",
  "https://...",
  "http://localhost or https://192.168.1.100",
  "RPC2",
  "sabnzbd",
  "downloadstation",
  "video/downloads",
  "/home/downloads/games",
  "games",
  "completed-games",
  "https://example.com/catalog.json",
  "http://localhost:8080/api",
  "https://api.g4u.to/api",
  "http://localhost:9117/api/v2.0/indexers/all/results/torznab/",
  "http://localhost:9696",
  "http://apprise:8000",
  "https://api.typesafe.ai/v1/systemone",
  "discord://webhook/...\npushover://token@user/",
  "discord://webhook/... pushover://token@user/",
  "76561198...",
  "https://xrel-api.nfos.to",
  "https://api.xrel.to",
  "/path/to/server.crt",
  "/path/to/server.key",
  "my-config-key",
  "jev-latest",
  "********",
  "{Title}",
  "{Region}",
  "{Platform}",
  "{Year}",
]);

const UI_TEXT_PROPERTY_NAMES = new Set([
  "title",
  "description",
  "desc",
  "label",
  "subtitle",
  "placeholder",
  "helperText",
  "emptyMessage",
  "emptyState",
  "buttonText",
  "ariaLabel",
  "aria-label",
  "ariaDescription",
  "aria-description",
  "tooltip",
  "heading",
  "message",
  "caption",
  "actionLabel",
  "confirmLabel",
  "cancelLabel",
  "successMessage",
  "errorMessage",
  "successTitle",
  "successDescription",
  "saveLabel",
  "emptyText",
  "noResultsText",
  "helpText",
  "labelText",
  "altText",
  "statusLabel",
  "summary",
  "hint",
  "content",
  "footer",
  "emptyLabel",
  "steps",
  "step",
  "when",
]);

function isUiTextVariable(name: string): boolean {
  return (
    !/^(is|has)[A-Z]/.test(name) &&
    /(?:Title|Description|Label|Message|Text|Subtitle|Hint|Tooltip|Prompt|Caption)(?:Source|Key)?$/i.test(
      name
    )
  );
}

function isHumanReadableCopy(value: string): boolean {
  return (
    value.trim().length > 2 &&
    /\p{L}/u.test(value) &&
    (/\s|[.!?:;{}→·]/u.test(value) || /^[A-ZÀ-ÖØ-Þ\p{Lu}]/u.test(value))
  );
}

function sourceFilesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return sourceFilesIn(path);
    }
    return /\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\.[^.]+$/.test(entry.name)
      ? [path]
      : [];
  });
}

function messageKeys(
  node: ts.Node,
  variableSources: Map<string, ts.Expression[]> = new Map(),
  seen = new Set<string>()
): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTaggedTemplateExpression(node)) {
    if (node.tag.getText() === "String.raw" && ts.isNoSubstitutionTemplateLiteral(node.template)) {
      const sourceFile = node.getSourceFile();
      return [
        sourceFile.text.slice(node.template.getStart(sourceFile) + 1, node.template.getEnd() - 1),
      ];
    }
    return messageKeys(node.template, variableSources, seen);
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...messageKeys(node.whenTrue, variableSources, seen),
      ...messageKeys(node.whenFalse, variableSources, seen),
    ];
  }
  if (ts.isBinaryExpression(node)) {
    return [
      ...messageKeys(node.left, variableSources, seen),
      ...messageKeys(node.right, variableSources, seen),
    ];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => messageKeys(element, variableSources, seen));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) =>
      ts.isPropertyAssignment(property)
        ? messageKeys(property.initializer, variableSources, seen)
        : []
    );
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return messageKeys(node.expression, variableSources, seen);
  }
  if (ts.isIdentifier(node) && !seen.has(node.text)) {
    const sources = variableSources.get(node.text);
    if (sources) {
      const nextSeen = new Set(seen).add(node.text);
      return sources.flatMap((source) => messageKeys(source, variableSources, nextSeen));
    }
  }
  return [];
}

function interfaceSourceKeys(): Set<string> {
  const keys = new Set<string>([
    ...BUILT_IN_RULES.map((rule) => rule.label),
    ...Object.values(RELEASE_FORMAT_FIELD_LABELS),
    ...Object.values(RELEASE_FORMAT_MATCH_MODE_LABELS),
  ]);

  for (const path of sourceFilesIn(CLIENT_SOURCE_ROOT)) {
    const text = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const hasInterfaceLanguageHook = text.includes("useInterfaceLanguage");
    const variableSources = new Map<string, ts.Expression[]>();
    const indexVariableSource = (name: string, expression: ts.Expression) => {
      if (!isUiTextVariable(name)) return;
      const sources = variableSources.get(name) ?? [];
      sources.push(expression);
      variableSources.set(name, sources);
    };
    const indexTextVariables = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        indexVariableSource(node.name.text, node.initializer);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        indexVariableSource(node.left.text, node.right);
      }
      ts.forEachChild(node, indexTextVariables);
    };
    indexTextVariables(sourceFile);

    const collect = (value: string) => {
      if (isHumanReadableCopy(value)) keys.add(value);
    };
    for (const sources of variableSources.values()) {
      sources.flatMap((source) => messageKeys(source, variableSources)).forEach(collect);
    }

    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue;
          const name = attribute.name.getText(sourceFile);
          const localizedSourceAttribute =
            node.tagName.getText(sourceFile) === "InterfaceText" && name === "source";
          const localizedMarker = /^data-i18n-(title|placeholder|aria-label|alt)$/.test(name);
          const staticInterfaceAttribute = UI_TEXT_PROPERTY_NAMES.has(name);
          if (!localizedSourceAttribute && !localizedMarker && !staticInterfaceAttribute) continue;
          if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
            collect(attribute.initializer.text);
          } else if (
            attribute.initializer &&
            ts.isJsxExpression(attribute.initializer) &&
            attribute.initializer.expression
          ) {
            messageKeys(attribute.initializer.expression, variableSources).forEach(collect);
          }
        }
      }

      if (ts.isPropertyAssignment(node)) {
        const name =
          ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
        if (UI_TEXT_PROPERTY_NAMES.has(name)) {
          messageKeys(node.initializer, variableSources).forEach(collect);
        }
      }

      if (ts.isCallExpression(node) && node.arguments[0]) {
        const callee = node.expression.getText(sourceFile);
        if (
          callee === "formatInterfaceMessage" ||
          callee === "translateInterfaceLabel" ||
          callee === "localizedText" ||
          (callee === "t" && hasInterfaceLanguageHook)
        ) {
          messageKeys(node.arguments[0], variableSources).forEach(collect);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return keys;
}

function rawInterfaceCopy(): Set<string> {
  const keys = new Set<string>();
  const localizedWrappers = new Set([
    "InterfaceText",
    "Trans",
    "FormattedMessage",
    "LocalizedText",
  ]);
  const localizableAttributes = new Set([
    "title",
    "placeholder",
    "aria-label",
    "aria-description",
    "alt",
  ]);

  for (const path of sourceFilesIn(CLIENT_SOURCE_ROOT)) {
    const text = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const tagName = (node: ts.Node): string => {
      if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(sourceFile);
      if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(sourceFile);
      return "";
    };
    const isInsideLocalizedWrapper = (node: ts.Node): boolean => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (
          (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
          localizedWrappers.has(tagName(parent))
        ) {
          return true;
        }
      }
      return false;
    };
    const collect = (value: string) => {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (isHumanReadableCopy(normalized)) keys.add(normalized);
    };
    const collectRawExpression = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        collect(node.text);
      } else if (ts.isConditionalExpression(node)) {
        collectRawExpression(node.whenTrue);
        collectRawExpression(node.whenFalse);
      } else if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) {
        collectRawExpression(node.left);
        collectRawExpression(node.right);
      } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
        collectRawExpression(node.expression);
      }
    };
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node) && !isInsideLocalizedWrapper(node)) {
        const parentTag = tagName(node.parent);
        if (!["code", "pre", "script", "style"].includes(parentTag)) collect(node.text);
      }

      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
        !isInsideLocalizedWrapper(node)
      ) {
        collectRawExpression(node.expression);
      }

      if (ts.isJsxAttribute(node) && localizableAttributes.has(node.name.getText(sourceFile))) {
        const attributeName = node.name.getText(sourceFile);
        const attributes = node.parent;
        const element = attributes.parent;
        const componentName = tagName(element);
        const hasLocalizationMarker = attributes.properties.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(sourceFile) === `data-i18n-${attributeName}`
        );
        const isLocalizedByPropConsumer =
          attributeName === "title" && ["StatsCard", "GameCarouselSection"].includes(componentName);

        if (
          node.initializer &&
          !hasLocalizationMarker &&
          !isLocalizedByPropConsumer &&
          !isInsideLocalizedWrapper(node)
        ) {
          if (ts.isStringLiteral(node.initializer)) {
            collect(node.initializer.text);
          } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
            messageKeys(node.initializer.expression).forEach(collect);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return keys;
}

function rawToastCopy(): Set<string> {
  const keys = new Set<string>();
  const localizedHelpers = new Set([
    "formatInterfaceMessage",
    "localizedText",
    "t",
    "translateInterfaceLabel",
  ]);

  for (const path of sourceFilesIn(CLIENT_SOURCE_ROOT)) {
    const sourceFile = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const collect = (value: string) => {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (isHumanReadableCopy(normalized)) keys.add(normalized);
    };
    const inspect = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        collect(node.text);
      } else if (ts.isConditionalExpression(node)) {
        inspect(node.whenTrue);
        inspect(node.whenFalse);
      } else if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) {
        inspect(node.left);
        inspect(node.right);
      } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
        inspect(node.expression);
      } else if (ts.isArrayLiteralExpression(node)) {
        node.elements.forEach(inspect);
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(sourceFile);
        if (!localizedHelpers.has(callee)) return;
      }
    };
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "toast" &&
        node.arguments[0] &&
        ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        for (const property of node.arguments[0].properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = ts.isIdentifier(property.name) ? property.name.text : "";
          if (name === "title" || name === "description") inspect(property.initializer);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return keys;
}

describe("interface source coverage", () => {
  it("catalogs every fixed interface string reference", () => {
    const uncatalogued = [...interfaceSourceKeys()].filter(
      (source) => !hasCatalogMessage(source) && !INTENTIONALLY_UNTRANSLATED_SOURCE_KEYS.has(source)
    );

    expect(uncatalogued).toEqual([]);
  });

  it("keeps visible copy inside localization wrappers", () => {
    const raw = [...rawInterfaceCopy()].filter(
      (source) => !INTENTIONALLY_UNTRANSLATED_SOURCE_KEYS.has(source)
    );

    expect(raw).toEqual([]);
  });

  it("catalogs fixed toast copy and translates it in the shared toast hook", () => {
    const uncatalogued = [...rawToastCopy()].filter(
      (source) => !hasCatalogMessage(source) && !INTENTIONALLY_UNTRANSLATED_SOURCE_KEYS.has(source)
    );
    const toastHook = readFileSync(resolve(CLIENT_SOURCE_ROOT, "hooks/use-toast.ts"), "utf8");

    expect(uncatalogued).toEqual([]);
    expect(toastHook).toMatch(/props\.title\s*=\s*translateInterfaceLabel\(props\.title\)/);
    expect(toastHook).toMatch(
      /props\.description\s*=\s*translateInterfaceLabel\(props\.description\)/
    );
  });
});
