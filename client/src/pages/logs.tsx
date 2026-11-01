import { getRegionalLocale, useRegionalPreference } from "@/lib/regional-format";
import {
  formatInterfaceMessage,
  getInterfaceCollator,
  getInterfaceTextDirection,
  getInterfaceTextLanguage,
  useInterfaceLanguage,
  type InterfaceLanguage,
} from "@/lib/interface-locale";
import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, PauseCircle, PlayCircle, ScrollText, Search, Send, Trash2 } from "lucide-react";
import SendLogsDialog from "@/components/SendLogsDialog";
import { apiRequest } from "@/lib/queryClient";
import { useLogStream } from "@/hooks/use-log-stream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { copyToClipboard } from "@/lib/utils";

interface LogField {
  key: string;
  value: unknown;
  displayValue: string;
  prettyValue: string;
}

interface ParsedLogLine {
  raw: string;
  payload: Record<string, unknown>;
  level: number;
  levelLabel: string;
  levelClass: string;
  time: string;
  module?: string | undefined;
  msg: string;
  summaryFields: LogField[];
  detailFields: LogField[];
  errorField?: LogField | undefined;
  searchableText: string;
  id: string;
}

const LEVEL_MAP: Record<number, { label: string; className: string }> = {
  10: { label: "TRACE", className: "bg-zinc-700 text-zinc-300" },
  20: { label: "DEBUG", className: "bg-zinc-600 text-zinc-200" },
  30: { label: "INFO", className: "bg-blue-600 text-blue-100" },
  40: { label: "WARN", className: "bg-yellow-600 text-yellow-100" },
  50: { label: "ERROR", className: "bg-red-600 text-red-100" },
  60: { label: "FATAL", className: "bg-red-900 text-red-100" },
};

const MAX_LINES = 5000;
const MOBILE_LOG_CAP = 200;
const ROW_HEIGHT = 32;
const OVERSCAN_ROWS = 10;
const DEFAULT_VIEWPORT_HEIGHT = 400;
const RESERVED_KEYS = new Set(["level", "time", "module", "msg"]);
const SUMMARY_KEYS = [
  "userId",
  "gameId",
  "indexer",
  "indexerName",
  "downloaderId",
  "downloaderName",
  "path",
  "method",
  "status",
  "statusCode",
  "hash",
  "socketId",
  "steamId",
  "feedId",
];

let lineCounter = 0;
const counterPrefix = Date.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatInlineValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatPrettyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toLogField(key: string, value: unknown): LogField {
  return {
    key,
    value,
    displayValue: formatInlineValue(value),
    prettyValue: formatPrettyValue(value),
  };
}

function sortFields(fields: LogField[]): LogField[] {
  return [...fields].sort((left, right) => {
    const leftSummaryIndex = SUMMARY_KEYS.indexOf(left.key);
    const rightSummaryIndex = SUMMARY_KEYS.indexOf(right.key);

    if (leftSummaryIndex !== -1 || rightSummaryIndex !== -1) {
      if (leftSummaryIndex === -1) return 1;
      if (rightSummaryIndex === -1) return -1;
      return leftSummaryIndex - rightSummaryIndex;
    }

    return left.key.localeCompare(right.key);
  });
}

function createParsedLogLine(
  raw: string,
  payload: Record<string, unknown>,
  fallbackMessage?: string
): ParsedLogLine {
  const level = typeof payload.level === "number" ? payload.level : 30;
  const levelInfo = LEVEL_MAP[level] ?? {
    label: String(level),
    className: "bg-zinc-500 text-white",
  };
  const time =
    typeof payload.time === "string"
      ? payload.time
      : typeof payload.time === "number"
        ? new Date(payload.time).toISOString()
        : "";
  const msg =
    typeof payload.msg === "string" && payload.msg.length > 0
      ? payload.msg
      : (fallbackMessage ?? raw);
  const fields = sortFields(
    Object.entries(payload)
      .filter(([key]) => !RESERVED_KEYS.has(key))
      .map(([key, value]) => toLogField(key, value))
  );
  const errorField = fields.find((field) => field.key === "err" || field.key === "error");
  const summaryFields = SUMMARY_KEYS.map((key) => fields.find((field) => field.key === key)).filter(
    (field): field is LogField => Boolean(field)
  );

  return {
    raw,
    payload,
    level,
    levelLabel: levelInfo.label,
    levelClass: levelInfo.className,
    time,
    module: typeof payload.module === "string" ? payload.module : undefined,
    msg,
    summaryFields,
    detailFields: fields,
    errorField,
    searchableText: raw.toLowerCase(),
    id: `log-${counterPrefix}-${++lineCounter}`,
  };
}

function parseLogLine(raw: string): ParsedLogLine {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) {
      return createParsedLogLine(raw, parsed);
    }
  } catch {
    // Fall back to an unstructured entry instead of silently dropping the line.
  }

  return createParsedLogLine(
    raw,
    {
      msg: raw,
      parseError: "Unstructured log line",
    },
    raw
  );
}

function formatTime(time: string): string {
  if (!time) return "";
  const parsed = new Date(time);
  return Number.isNaN(parsed.getTime()) ? time : parsed.toLocaleTimeString(getRegionalLocale());
}

function formatDateTime(time: string): string {
  if (!time) return "";
  const parsed = new Date(time);
  return Number.isNaN(parsed.getTime()) ? time : parsed.toLocaleString(getRegionalLocale());
}

function buildSummaryText(fields: LogField[]): string {
  if (fields.length === 0) return "-";
  return fields.map((field) => `${field.key}: ${field.displayValue}`).join(" | ");
}

const LogLineRow = memo(function LogLineRow({
  line,
  isSelected,
  onSelect,
}: Readonly<{
  line: ParsedLogLine;
  isSelected: boolean;
  onSelect: (line: ParsedLogLine) => void;
}>) {
  useRegionalPreference();
  const { language, languageFor, directionFor } = useInterfaceLanguage();
  const timeStr = formatTime(line.time);
  const summaryText = buildSummaryText(line.summaryFields);

  return (
    <button
      type="button"
      className={[
        "grid h-8 min-w-max grid-cols-[5rem_4rem_6.5rem_minmax(18rem,2fr)_minmax(14rem,1.6fr)] items-center gap-2 rounded px-1 text-start transition-colors",
        isSelected ? "bg-white/10" : "hover:bg-white/5",
      ].join(" ")}
      onClick={() => onSelect(line)}
      data-testid="log-line-row"
      aria-label={formatInterfaceMessage(
        "interface.inspect_log_message_991b5716",
        { message: line.msg },
        language
      )}
      lang={languageFor("interface.inspect_log_message_991b5716")}
      dir={directionFor("interface.inspect_log_message_991b5716")}
    >
      <span className="w-20 flex-shrink-0 text-end tabular-nums text-zinc-500">{timeStr}</span>
      <span
        className={`w-12 flex-shrink-0 rounded px-1.5 text-center text-xs font-bold leading-5 ${line.levelClass}`}
      >
        {line.levelLabel}
      </span>
      <span className="truncate text-zinc-400" lang="und" dir="auto">
        {line.module ?? "-"}
      </span>
      <span className="truncate text-zinc-100" title={line.msg} lang="und" dir="auto">
        {line.msg}
      </span>
      <span className="truncate text-zinc-400" title={summaryText} lang="und" dir="auto">
        {summaryText}
      </span>
    </button>
  );
});

const LogLineCard = memo(function LogLineCard({
  line,
  isSelected,
  onSelect,
}: Readonly<{
  line: ParsedLogLine;
  isSelected: boolean;
  onSelect: (line: ParsedLogLine) => void;
}>) {
  useRegionalPreference();
  const { language, languageFor, directionFor } = useInterfaceLanguage();
  const timeStr = formatTime(line.time);
  const summaryText = buildSummaryText(line.summaryFields);

  return (
    <button
      type="button"
      className={[
        "w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-start transition-colors",
        isSelected ? "ring-1 ring-primary/60" : "hover:bg-zinc-900/90",
      ].join(" ")}
      onClick={() => onSelect(line)}
      data-testid="log-line-row"
      aria-label={formatInterfaceMessage(
        "interface.inspect_log_message_991b5716",
        { message: line.msg },
        language
      )}
      lang={languageFor("interface.inspect_log_message_991b5716")}
      dir={directionFor("interface.inspect_log_message_991b5716")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tabular-nums text-zinc-500">{timeStr}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${line.levelClass}`}>
          {line.levelLabel}
        </span>
        {line.module && (
          <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">
            <span lang="und" dir="auto">
              {line.module}
            </span>
          </span>
        )}
      </div>
      <p className="mt-2 break-words text-sm text-zinc-100" lang="und" dir="auto">
        {line.msg}
      </p>
      {summaryText !== "-" && (
        <p className="mt-2 break-words text-xs text-zinc-400" lang="und" dir="auto">
          {summaryText}
        </p>
      )}
    </button>
  );
});

const InspectorFieldList = memo(function InspectorFieldList({
  fields,
  emptyState,
}: Readonly<{ fields: LogField[]; emptyState: string }>) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  if (fields.length === 0) {
    return (
      <div
        className="rounded-lg border border-border bg-black/20 p-4 text-sm text-muted-foreground"
        lang={languageFor(emptyState)}
        dir={directionFor(emptyState)}
      >
        {t(emptyState)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <section key={field.key} className="rounded-lg border border-border bg-black/20 p-4">
          <h3
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400"
            lang="und"
            dir="auto"
          >
            {field.key}
          </h3>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-zinc-100">
            <span lang="und" dir="auto">
              {field.prettyValue}
            </span>
          </pre>
        </section>
      ))}
    </div>
  );
});

function LogInspector({
  line,
  onClose,
  onCopy,
}: Readonly<{
  line: ParsedLogLine | null;
  onClose: () => void;
  onCopy: (text: string, description: string, values?: Record<string, string | number>) => void;
}>) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  const additionalFields = useMemo(
    () => line?.detailFields.filter((field) => field.key !== "err" && field.key !== "error") ?? [],
    [line]
  );

  return (
    <Sheet open={Boolean(line)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 border-s border-border bg-zinc-950 p-0 text-zinc-100 sm:max-w-3xl"
      >
        {line && (
          <>
            <SheetHeader className="border-b border-border p-6 pe-14">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle
                  className="text-zinc-50"
                  lang={languageFor("interface.log_details_74fe9c53")}
                  dir={directionFor("interface.log_details_74fe9c53")}
                >
                  {t("interface.log_details_74fe9c53")}
                </SheetTitle>
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  {line.levelLabel}
                </Badge>
                {line.module && (
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">
                    <span lang="und" dir="auto">
                      {line.module}
                    </span>
                  </Badge>
                )}
              </div>
              <SheetDescription
                className="text-zinc-400"
                lang={line.time ? "und" : languageFor("interface.no_timestamp_b045a976")}
                dir={line.time ? "auto" : directionFor("interface.no_timestamp_b045a976")}
              >
                {line.time ? formatDateTime(line.time) : t("interface.no_timestamp_b045a976")}
              </SheetDescription>
              <p className="mt-2 text-sm text-zinc-100" lang="und" dir="auto">
                {line.msg}
              </p>
              {line.summaryFields.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {line.summaryFields.map((field) => (
                    <Badge
                      key={field.key}
                      variant="outline"
                      className="border-zinc-700 bg-zinc-900/80 text-zinc-200"
                    >
                      <span lang="und" dir="auto">
                        {field.key}: {field.displayValue}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}
            </SheetHeader>

            <div className="flex items-center justify-between gap-2 border-b border-border px-6 py-3">
              <p
                className="text-sm text-zinc-400"
                lang={languageFor("interface.full_parsed_payload_retained_for_t_e0cae336")}
                dir={directionFor("interface.full_parsed_payload_retained_for_t_e0cae336")}
              >
                {t("interface.full_parsed_payload_retained_for_t_e0cae336")}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCopy(line.raw, "Raw log line copied")}
                  aria-label={t("interface.copy_raw_log_line_16ea97d6")}
                  lang={languageFor("interface.copy_raw_log_line_16ea97d6")}
                  dir={directionFor("interface.copy_raw_log_line_16ea97d6")}
                >
                  <Copy className="me-1 h-4 w-4" />
                  <span
                    lang={languageFor("interface.copy_raw_adfbe522")}
                    dir={directionFor("interface.copy_raw_adfbe522")}
                  >
                    {t("interface.copy_raw_adfbe522")}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onCopy(JSON.stringify(line.payload, null, 2), "Parsed payload copied")
                  }
                  aria-label={t("interface.copy_parsed_payload_12cb9427")}
                  lang={languageFor("interface.copy_parsed_payload_12cb9427")}
                  dir={directionFor("interface.copy_parsed_payload_12cb9427")}
                >
                  <Copy className="me-1 h-4 w-4" />
                  <span
                    lang={languageFor("interface.copy_json_e595bc8e")}
                    dir={directionFor("interface.copy_json_e595bc8e")}
                  >
                    {t("interface.copy_json_e595bc8e")}
                  </span>
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                <section className="rounded-lg border border-border bg-black/20 p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <span
                      lang={languageFor("interface.standard_fields_68afefe5")}
                      dir={directionFor("interface.standard_fields_68afefe5")}
                    >
                      {t("interface.standard_fields_68afefe5")}
                    </span>
                  </h3>
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <span
                        className="text-zinc-500"
                        lang={languageFor("interface.timestamp_29ade1c3")}
                        dir={directionFor("interface.timestamp_29ade1c3")}
                      >
                        {t("interface.timestamp_29ade1c3")}
                      </span>
                      <p
                        className="mt-1 break-words text-zinc-100"
                        lang={line.time ? "und" : languageFor("interface.no_timestamp_b045a976")}
                        dir={line.time ? "auto" : directionFor("interface.no_timestamp_b045a976")}
                      >
                        {line.time
                          ? formatDateTime(line.time)
                          : t("interface.no_timestamp_b045a976")}
                      </p>
                    </div>
                    <div>
                      <span
                        className="text-zinc-500"
                        lang={languageFor("interface.level_4155597d")}
                        dir={directionFor("interface.level_4155597d")}
                      >
                        {t("interface.level_4155597d")}
                      </span>
                      <p className="mt-1 text-zinc-100">{line.levelLabel}</p>
                    </div>
                    <div>
                      <span
                        className="text-zinc-500"
                        lang={languageFor("interface.module_c4fc60bd")}
                        dir={directionFor("interface.module_c4fc60bd")}
                      >
                        {t("interface.module_c4fc60bd")}
                      </span>
                      <p className="mt-1 break-words text-zinc-100" lang="und" dir="auto">
                        {line.module ?? "-"}
                      </p>
                    </div>
                    <div>
                      <span
                        className="text-zinc-500"
                        lang={languageFor("interface.message_ae0ed984")}
                        dir={directionFor("interface.message_ae0ed984")}
                      >
                        {t("interface.message_ae0ed984")}
                      </span>
                      <p className="mt-1 break-words text-zinc-100" lang="und" dir="auto">
                        {line.msg}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <span
                      lang={languageFor("interface.additional_metadata_bf9f8441")}
                      dir={directionFor("interface.additional_metadata_bf9f8441")}
                    >
                      {t("interface.additional_metadata_bf9f8441")}
                    </span>
                  </h3>
                  <InspectorFieldList
                    fields={additionalFields}
                    emptyState="No additional structured metadata was present on this log line."
                  />
                </section>

                {line.errorField && (
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      <span
                        lang={languageFor("interface.structured_error_26a19c34")}
                        dir={directionFor("interface.structured_error_26a19c34")}
                      >
                        {t("interface.structured_error_26a19c34")}
                      </span>
                    </h3>
                    <InspectorFieldList
                      fields={[line.errorField]}
                      emptyState="No structured error payload was present on this log line."
                    />
                  </section>
                )}

                <section className="rounded-lg border border-border bg-black/20 p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <span
                      lang={languageFor("interface.raw_ndjson_00787ad7")}
                      dir={directionFor("interface.raw_ndjson_00787ad7")}
                    >
                      {t("interface.raw_ndjson_00787ad7")}
                    </span>
                  </h3>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-zinc-100">
                    <span lang="und" dir="auto">
                      {line.raw}
                    </span>
                  </pre>
                </section>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function LogsPage() {
  useRegionalPreference();
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const moduleCollator = useMemo(() => getInterfaceCollator(language), [language]);
  const localizedText = useCallback(
    (
      source: string,
      values: Record<string, string | number> = {},
      currentLanguage: InterfaceLanguage = language
    ) => {
      const text = formatInterfaceMessage(source, values, currentLanguage);
      if (currentLanguage === "en") return text;
      return (
        <span
          lang={getInterfaceTextLanguage(source, currentLanguage)}
          dir={getInterfaceTextDirection(source, currentLanguage)}
        >
          {text}
        </span>
      );
    },
    [language]
  );
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const userPausedRef = useRef(false);
  const [lines, setLines] = useState<ParsedLogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterText, setFilterText] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const [selectedLine, setSelectedLine] = useState<ParsedLogLine | null>(null);
  const [sendLogsOpen, setSendLogsOpen] = useState(false);

  const { data: initialData, isLoading } = useQuery<{ lines: string[] }>({
    queryKey: ["/api/logs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/logs?limit=1000");
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!initialData?.lines) return;
    setLines(initialData.lines.map((raw) => parseLogLine(raw)));
  }, [initialData]);

  const handleNewLine = useCallback((raw: string) => {
    const parsed = parseLogLine(raw);
    setLines((prev) => {
      const next = [...prev, parsed];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  useLogStream(handleNewLine);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    const updateViewportHeight = () =>
      setViewportHeight(viewport.clientHeight || DEFAULT_VIEWPORT_HEIGHT);

    updateViewportHeight();

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  const modules = useMemo(() => {
    const set = new Set(
      lines.map((line) => line.module).filter((module): module is string => Boolean(module))
    );
    return Array.from(set).sort(moduleCollator.compare);
  }, [lines, moduleCollator]);

  const minLevel = filterLevel === "all" ? 0 : Number.parseInt(filterLevel, 10);
  const normalizedFilterText = filterText.trim().toLowerCase();

  const filteredLines = useMemo(
    () =>
      lines.filter((line) => {
        if (line.level < minLevel) return false;
        if (filterModule !== "all" && line.module !== filterModule) return false;
        if (normalizedFilterText && !line.searchableText.includes(normalizedFilterText))
          return false;
        return true;
      }),
    [lines, minLevel, filterModule, normalizedFilterText]
  );

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;

    const viewport = scrollRef.current;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
      setScrollTop(viewport.scrollTop);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [autoScroll, filteredLines.length]);

  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    if (filteredLines.length === 0) {
      return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0 };
    }

    const maxScrollTop = Math.max(0, filteredLines.length * ROW_HEIGHT - viewportHeight);
    const clampedScrollTop = Math.min(scrollTop, maxScrollTop);
    const visibleRows = Math.max(1, Math.ceil(viewportHeight / ROW_HEIGHT));
    const start = Math.max(0, Math.floor(clampedScrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
    const end = Math.min(
      filteredLines.length,
      Math.ceil((clampedScrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS
    );

    return {
      startIndex: start,
      endIndex: Math.max(start + visibleRows, end),
      topSpacerHeight: start * ROW_HEIGHT,
      bottomSpacerHeight: Math.max(
        0,
        (filteredLines.length - Math.max(start + visibleRows, end)) * ROW_HEIGHT
      ),
    };
  }, [filteredLines.length, scrollTop, viewportHeight]);

  const visibleLines = useMemo(
    () => filteredLines.slice(startIndex, endIndex),
    [filteredLines, startIndex, endIndex]
  );
  const linesToRender = isMobile ? filteredLines.slice(-MOBILE_LOG_CAP) : visibleLines;
  const logCountSummary =
    isMobile && filteredLines.length > MOBILE_LOG_CAP
      ? formatInterfaceMessage(
          "interface.showing_the_latest_shown_of_count_1e0667a5",
          { shown: MOBILE_LOG_CAP, count: filteredLines.length },
          language
        )
      : formatInterfaceMessage(
          "interface.count_lines_displayed_cae583fc",
          { count: filteredLines.length },
          language
        );

  const copyText = useCallback(
    (text: string, description: string, values: Record<string, string | number> = {}) => {
      void copyToClipboard(text).then((succeeded) => {
        if (succeeded) {
          toast({
            title: "interface.copied_8dc21305",
            description: (currentLanguage) => localizedText(description, values, currentLanguage),
          });
        } else {
          toast({
            title: "interface.copy_failed_aad6c2a1",
            description: (currentLanguage) =>
              localizedText("interface.clipboard_access_denied_c311c408", {}, currentLanguage),
            variant: "destructive",
          });
        }
      });
    },
    [localizedText, toast]
  );

  const handleCopy = () => {
    const text = filteredLines.map((line) => line.raw).join("\n");
    copyText(text, "{count} log lines copied to clipboard", { count: filteredLines.length });
  };

  const handleClear = () => {
    setLines([]);
    setSelectedLine(null);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setScrollTop(element.scrollTop);
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    if (!userPausedRef.current) {
      setAutoScroll(atBottom);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-shrink-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ScrollText className="h-6 w-6" />
            <span
              lang={languageFor("interface.server_logs_b6f4597d")}
              dir={directionFor("interface.server_logs_b6f4597d")}
            >
              {t("interface.server_logs_b6f4597d")}
            </span>
          </h1>
          <p
            className="mt-0.5 text-sm text-muted-foreground"
            lang={languageFor("interface.real_time_server_output_summary_8dd9dcd7")}
            dir={directionFor("interface.real_time_server_output_summary_8dd9dcd7")}
          >
            {formatInterfaceMessage(
              "interface.real_time_server_output_summary_8dd9dcd7",
              { summary: logCountSummary },
              language
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAutoScroll((prev) => {
                const next = !prev;
                userPausedRef.current = !next;
                return next;
              });
            }}
            aria-label={t(autoScroll ? "Pause auto-scroll" : "Resume auto-scroll")}
            lang={languageFor(autoScroll ? "Pause auto-scroll" : "Resume auto-scroll")}
            dir={directionFor(autoScroll ? "Pause auto-scroll" : "Resume auto-scroll")}
          >
            {autoScroll ? (
              <>
                <PauseCircle className="me-1 h-4 w-4" />
                <span
                  lang={languageFor("interface.pause_44f9bf2d")}
                  dir={directionFor("interface.pause_44f9bf2d")}
                >
                  {t("interface.pause_44f9bf2d")}
                </span>
              </>
            ) : (
              <>
                <PlayCircle className="me-1 h-4 w-4" />
                <span
                  lang={languageFor("interface.resume_454d1d8a")}
                  dir={directionFor("interface.resume_454d1d8a")}
                >
                  {t("interface.resume_454d1d8a")}
                </span>
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={filteredLines.length === 0}
            aria-label={t("interface.copy_log_lines_2ec889e1")}
            lang={languageFor("interface.copy_log_lines_2ec889e1")}
            dir={directionFor("interface.copy_log_lines_2ec889e1")}
          >
            <Copy className="me-1 h-4 w-4" />
            <span
              lang={languageFor("interface.copy_658f3664")}
              dir={directionFor("interface.copy_658f3664")}
            >
              {t("interface.copy_658f3664")}
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={lines.length === 0}
            aria-label={t("interface.clear_log_lines_be68a65f")}
            lang={languageFor("interface.clear_log_lines_be68a65f")}
            dir={directionFor("interface.clear_log_lines_be68a65f")}
          >
            <Trash2 className="me-1 h-4 w-4" />
            <span
              lang={languageFor("interface.clear_04a57fc2")}
              dir={directionFor("interface.clear_04a57fc2")}
            >
              {t("interface.clear_04a57fc2")}
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSendLogsOpen(true)}
            disabled={filteredLines.length === 0}
            aria-label={t("interface.send_logs_to_support_755fbd30")}
            lang={languageFor("interface.send_logs_to_support_755fbd30")}
            dir={directionFor("interface.send_logs_to_support_755fbd30")}
          >
            <Send className="me-1 h-4 w-4" />
            <span
              lang={languageFor("interface.send_logs_be96d4fe")}
              dir={directionFor("interface.send_logs_be96d4fe")}
            >
              {t("interface.send_logs_be96d4fe")}
            </span>
          </Button>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger
            className="w-full sm:w-36"
            aria-label={t("interface.filter_by_log_level_71023c08")}
            lang={languageFor("interface.filter_by_log_level_71023c08")}
            dir={directionFor("interface.filter_by_log_level_71023c08")}
          >
            <SelectValue placeholder={t("interface.level_4155597d")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="all"
              lang={languageFor("interface.all_levels_a3c66913")}
              dir={directionFor("interface.all_levels_a3c66913")}
            >
              {t("interface.all_levels_a3c66913")}
            </SelectItem>
            <SelectItem
              value="10"
              lang={languageFor("interface.trace_bed443ff")}
              dir={directionFor("interface.trace_bed443ff")}
            >
              {t("interface.trace_bed443ff")}
            </SelectItem>
            <SelectItem
              value="20"
              lang={languageFor("interface.debug_c9b7d6e9")}
              dir={directionFor("interface.debug_c9b7d6e9")}
            >
              {t("interface.debug_c9b7d6e9")}
            </SelectItem>
            <SelectItem
              value="30"
              lang={languageFor("interface.info_8e9d280a")}
              dir={directionFor("interface.info_8e9d280a")}
            >
              {t("interface.info_8e9d280a")}
            </SelectItem>
            <SelectItem
              value="40"
              lang={languageFor("interface.warn_3ca5bb4e")}
              dir={directionFor("interface.warn_3ca5bb4e")}
            >
              {t("interface.warn_3ca5bb4e")}
            </SelectItem>
            <SelectItem
              value="50"
              lang={languageFor("interface.error_41edeb2e")}
              dir={directionFor("interface.error_41edeb2e")}
            >
              {t("interface.error_41edeb2e")}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label={t("interface.filter_by_module_1ff8bbc4")}
            lang={languageFor("interface.filter_by_module_1ff8bbc4")}
            dir={directionFor("interface.filter_by_module_1ff8bbc4")}
          >
            <SelectValue placeholder={t("interface.module_c4fc60bd")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="all"
              lang={languageFor("interface.all_modules_15d36235")}
              dir={directionFor("interface.all_modules_15d36235")}
            >
              {t("interface.all_modules_15d36235")}
            </SelectItem>
            {modules.map((module) => (
              <SelectItem key={module} value={module} lang="und" dir="auto">
                {module}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder={t("interface.search_message_or_any_json_field_3c9cb905")}
            lang={languageFor("interface.search_message_or_any_json_field_3c9cb905")}
            dir={directionFor("interface.search_message_or_any_json_field_3c9cb905")}
            className="ps-9"
            aria-label={t("interface.search_log_lines_a9ee0b38")}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto rounded-lg border border-border bg-zinc-950 font-mono text-xs"
          onScroll={handleScroll}
          role="log"
          aria-label={t("interface.server_log_output_160abbb9")}
          lang={languageFor("interface.server_log_output_160abbb9")}
          dir={directionFor("interface.server_log_output_160abbb9")}
          aria-live="polite"
          aria-relevant="additions text"
          data-testid="logs-viewport"
        >
          {filteredLines.length === 0 && (
            <p
              className="p-3 pt-8 text-center text-zinc-500"
              lang={languageFor("interface.no_log_lines_to_display_2cf3f974")}
              dir={directionFor("interface.no_log_lines_to_display_2cf3f974")}
            >
              {t("interface.no_log_lines_to_display_2cf3f974")}
            </p>
          )}
          {filteredLines.length > 0 && (
            <div className={isMobile ? "space-y-3 p-3" : "min-w-max p-3"}>
              {!isMobile && (
                <>
                  <div className="mb-2 grid grid-cols-[5rem_4rem_6.5rem_minmax(18rem,2fr)_minmax(14rem,1.6fr)] gap-2 px-1 text-[11px] uppercase tracking-wide text-zinc-500">
                    <span
                      className="text-end"
                      lang={languageFor("interface.time_dfe4e404")}
                      dir={directionFor("interface.time_dfe4e404")}
                    >
                      {t("interface.time_dfe4e404")}
                    </span>
                    <span
                      className="text-center"
                      lang={languageFor("interface.level_4155597d")}
                      dir={directionFor("interface.level_4155597d")}
                    >
                      {t("interface.level_4155597d")}
                    </span>
                    <span
                      lang={languageFor("interface.module_c4fc60bd")}
                      dir={directionFor("interface.module_c4fc60bd")}
                    >
                      {t("interface.module_c4fc60bd")}
                    </span>
                    <span
                      lang={languageFor("interface.message_ae0ed984")}
                      dir={directionFor("interface.message_ae0ed984")}
                    >
                      {t("interface.message_ae0ed984")}
                    </span>
                    <span
                      lang={languageFor("interface.context_bd317f1c")}
                      dir={directionFor("interface.context_bd317f1c")}
                    >
                      {t("interface.context_bd317f1c")}
                    </span>
                  </div>
                  {topSpacerHeight > 0 && (
                    <div style={{ height: topSpacerHeight }} aria-hidden="true" />
                  )}
                </>
              )}
              {linesToRender.map((line) =>
                isMobile ? (
                  <LogLineCard
                    key={line.id}
                    line={line}
                    isSelected={selectedLine?.id === line.id}
                    onSelect={setSelectedLine}
                  />
                ) : (
                  <LogLineRow
                    key={line.id}
                    line={line}
                    isSelected={selectedLine?.id === line.id}
                    onSelect={setSelectedLine}
                  />
                )
              )}
              {!isMobile && bottomSpacerHeight > 0 && (
                <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
              )}
            </div>
          )}
        </div>
      )}

      <LogInspector line={selectedLine} onClose={() => setSelectedLine(null)} onCopy={copyText} />

      <SendLogsDialog
        open={sendLogsOpen}
        onOpenChange={setSendLogsOpen}
        logLines={filteredLines.map((line) => line.raw)}
      />
    </div>
  );
}
