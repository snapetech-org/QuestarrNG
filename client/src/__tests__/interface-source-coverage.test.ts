import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { BUILT_IN_RULES } from "@shared/release-scoring";
import {
  RELEASE_FORMAT_FIELD_LABELS,
  RELEASE_FORMAT_MATCH_MODE_LABELS,
} from "@/lib/release-scoring-labels";
import { UI_LABELS } from "@/lib/ui-labels";

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
]);

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

function messageKeys(node: ts.Node): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) {
    return [...messageKeys(node.whenTrue), ...messageKeys(node.whenFalse)];
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    return messageKeys(node.expression);
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

    const collect = (value: string) => {
      if (value.trim() && /\p{L}/u.test(value)) keys.add(value);
    };
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue;
          const name = attribute.name.getText(sourceFile);
          const localizedSourceAttribute =
            node.tagName.getText(sourceFile) === "InterfaceText" && name === "source";
          const localizedMarker = /^data-i18n-(title|placeholder|aria-label|alt)$/.test(name);
          const staticInterfaceAttribute = [
            "title",
            "placeholder",
            "aria-label",
            "aria-description",
            "alt",
          ].includes(name);
          if (!localizedSourceAttribute && !localizedMarker && !staticInterfaceAttribute) continue;
          if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
            collect(attribute.initializer.text);
          } else if (
            attribute.initializer &&
            ts.isJsxExpression(attribute.initializer) &&
            attribute.initializer.expression
          ) {
            messageKeys(attribute.initializer.expression).forEach(collect);
          }
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
          messageKeys(node.arguments[0]).forEach(collect);
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
      if (normalized && /\p{L}/u.test(normalized)) keys.add(normalized);
    };
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node) && !isInsideLocalizedWrapper(node)) {
        const parentTag = tagName(node.parent);
        if (!["code", "pre", "script", "style"].includes(parentTag)) collect(node.text);
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

describe("interface source coverage", () => {
  it("catalogs every fixed interface string reference", () => {
    const uncatalogued = [...interfaceSourceKeys()].filter(
      (source) =>
        !Object.hasOwn(UI_LABELS, source) && !INTENTIONALLY_UNTRANSLATED_SOURCE_KEYS.has(source)
    );

    expect(uncatalogued).toEqual([]);
  });

  it("keeps visible copy inside localization wrappers", () => {
    const raw = [...rawInterfaceCopy()].filter(
      (source) => !INTENTIONALLY_UNTRANSLATED_SOURCE_KEYS.has(source)
    );

    expect(raw).toEqual([]);
  });
});
