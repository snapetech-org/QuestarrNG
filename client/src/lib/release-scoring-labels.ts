import type { FormatField, FormatMatchMode } from "@shared/release-scoring";

export const RELEASE_FORMAT_FIELD_LABELS: Record<FormatField, string> = {
  title: "Title",
  group: "Release group",
  uploader: "Uploader",
  category: "Category",
  protocol: "Protocol",
  indexer: "Indexer",
};

export const RELEASE_FORMAT_MATCH_MODE_LABELS: Record<FormatMatchMode, string> = {
  contains: "Contains",
  exact: "Exact match",
  regex: "Regular expression",
};
