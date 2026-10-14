import { getRegionalLocale, useRegionalPreference } from "@/lib/regional-format";
import {
  formatInterfaceMessage,
  getInterfaceCollator,
  useInterfaceLanguage,
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
        "grid h-8 min-w-max grid-cols-[5rem_4rem_6.5rem_minmax(18rem,2fr)_minmax(14rem,1.6fr)] items-center gap-2 rounded px-1 text-left transition-colors",
        isSelected ? "bg-white/10" : "hover:bg-white/5",
      ].join(" ")}
      onClick={() => onSelect(line)}
      data-testid="log-line-row"
      aria-label={formatInterfaceMessage("Inspect log: {message}", { message: line.msg }, language)}
      lang={languageFor("Inspect log: {message}")}
      dir={directionFor("Inspect log: {message}")}
    >
      <span className="w-20 flex-shrink-0 text-right tabular-nums text-zinc-500">{timeStr}</span>
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
        "w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 text-left transition-colors",
        isSelected ? "ring-1 ring-primary/60" : "hover:bg-zinc-900/90",
      ].join(" ")}
      onClick={() => onSelect(line)}
      data-testid="log-line-row"
      aria-label={formatInterfaceMessage("Inspect log: {message}", { message: line.msg }, language)}
      lang={languageFor("Inspect log: {message}")}
      dir={directionFor("Inspect log: {message}")}
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
        className="flex h-full w-full flex-col gap-0 border-l border-border bg-zinc-950 p-0 text-zinc-100 sm:max-w-3xl"
      >
        {line && (
          <>
            <SheetHeader className="border-b border-border p-6 pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle
                  className="text-zinc-50"
                  lang={languageFor("Log details")}
                  dir={directionFor("Log details")}
                >
                  {t("Log details")}
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
                lang={line.time ? "und" : languageFor("No timestamp")}
                dir={line.time ? "auto" : directionFor("No timestamp")}
              >
                {line.time ? formatDateTime(line.time) : t("No timestamp")}
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
                lang={languageFor("Full parsed payload retained for this log entry.")}
                dir={directionFor("Full parsed payload retained for this log entry.")}
              >
                {t("Full parsed payload retained for this log entry.")}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCopy(line.raw, "Raw log line copied")}
                  aria-label={t("Copy raw log line")}
                  lang={languageFor("Copy raw log line")}
                  dir={directionFor("Copy raw log line")}
                >
                  <Copy className="mr-1 h-4 w-4" />
                  <span lang={languageFor("Copy raw")} dir={directionFor("Copy raw")}>
                    {t("Copy raw")}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onCopy(JSON.stringify(line.payload, null, 2), "Parsed payload copied")
                  }
                  aria-label={t("Copy parsed payload")}
                  lang={languageFor("Copy parsed payload")}
                  dir={directionFor("Copy parsed payload")}
                >
                  <Copy className="mr-1 h-4 w-4" />
                  <span lang={languageFor("Copy JSON")} dir={directionFor("Copy JSON")}>
                    {t("Copy JSON")}
                  </span>
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                <section className="rounded-lg border border-border bg-black/20 p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <span
                      lang={languageFor("Standard fields")}
                      dir={directionFor("Standard fields")}
                    >
                      {t("Standard fields")}
                    </span>
                  </h3>
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <span
                        className="text-zinc-500"
                        lang={languageFor("Timestamp")}
                        dir={directionFor("Timestamp")}
                      >
                        {t("Timestamp")}
                      </span>
                      <p
                        className="mt-1 break-words text-zinc-100"
                        lang={line.time ? "und" : languageFor("No timestamp")}
                        dir={line.time ? "auto" : directionFor("No timestamp")}
                      >
                        {line.time ? formatDateTime(line.time) : t("No timestamp")}
                      </p>
                    </div>
                    <div>
                      <span
                        className="text-zinc-500"
                        lang={languageFor("Level")}
                        dir={directionFor("Level")}
                      >
                        {t("Level")}
                      </span>
                      <p className="mt-1 text-zinc-100">{line.levelLabel}</p>
                    </div>
                    <div>
                      <span
                        className="text-zinc-500"
                        lang={languageFor("Module")}
                        dir={directionFor("Module")}
                      >
                        {t("Module")}
                      </span>
                      <p className="mt-1 break-words text-zinc-100" lang="und" dir="auto">
                        {line.module ?? "-"}
                      </p>
                    </div>
                    <div>
                      <span
                        className="text-zinc-500"
                        lang={languageFor("Message")}
                        dir={directionFor("Message")}
                      >
                        {t("Message")}
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
                      lang={languageFor("Additional metadata")}
                      dir={directionFor("Additional metadata")}
                    >
                      {t("Additional metadata")}
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
                        lang={languageFor("Structured error")}
                        dir={directionFor("Structured error")}
                      >
                        {t("Structured error")}
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
                    <span lang={languageFor("Raw NDJSON")} dir={directionFor("Raw NDJSON")}>
                      {t("Raw NDJSON")}
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
    (source: string, values: Record<string, string | number> = {}) => {
      const text = formatInterfaceMessage(source, values, language);
      if (language === "en") return text;
      return (
        <span lang={languageFor(source)} dir={directionFor(source)}>
          {text}
        </span>
      );
    },
    [directionFor, language, languageFor]
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
  const MOBILE_LOG_CAP = 200;
  const linesToRender = isMobile ? filteredLines.slice(-MOBILE_LOG_CAP) : visibleLines;

  const copyText = useCallback(
    (text: string, description: string, values: Record<string, string | number> = {}) => {
      void copyToClipboard(text).then((succeeded) => {
        if (succeeded) {
          toast({
            title: localizedText("Copied"),
            description: localizedText(description, values),
          });
        } else {
          toast({
            title: localizedText("Copy failed"),
            description: localizedText("Clipboard access denied"),
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
            <span lang={languageFor("Server Logs")} dir={directionFor("Server Logs")}>
              {t("Server Logs")}
            </span>
          </h1>
          <p
            className="mt-0.5 text-sm text-muted-foreground"
            lang={languageFor("Real-time server output — {count} lines displayed")}
            dir={directionFor("Real-time server output — {count} lines displayed")}
          >
            {formatInterfaceMessage(
              "Real-time server output — {count} lines displayed",
              { count: filteredLines.length },
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
                <PauseCircle className="mr-1 h-4 w-4" />
                <span lang={languageFor("Pause")} dir={directionFor("Pause")}>
                  {t("Pause")}
                </span>
              </>
            ) : (
              <>
                <PlayCircle className="mr-1 h-4 w-4" />
                <span lang={languageFor("Resume")} dir={directionFor("Resume")}>
                  {t("Resume")}
                </span>
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            aria-label={t("Copy log lines")}
            lang={languageFor("Copy log lines")}
            dir={directionFor("Copy log lines")}
          >
            <Copy className="mr-1 h-4 w-4" />
            <span lang={languageFor("Copy")} dir={directionFor("Copy")}>
              {t("Copy")}
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            aria-label={t("Clear log lines")}
            lang={languageFor("Clear log lines")}
            dir={directionFor("Clear log lines")}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            <span lang={languageFor("Clear")} dir={directionFor("Clear")}>
              {t("Clear")}
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSendLogsOpen(true)}
            aria-label={t("Send logs to support")}
            lang={languageFor("Send logs to support")}
            dir={directionFor("Send logs to support")}
          >
            <Send className="mr-1 h-4 w-4" />
            <span lang={languageFor("Send Logs")} dir={directionFor("Send Logs")}>
              {t("Send Logs")}
            </span>
          </Button>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger
            className="w-full sm:w-36"
            aria-label={t("Filter by log level")}
            lang={languageFor("Filter by log level")}
            dir={directionFor("Filter by log level")}
          >
            <SelectValue placeholder={t("Level")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="all"
              lang={languageFor("All levels")}
              dir={directionFor("All levels")}
            >
              {t("All levels")}
            </SelectItem>
            <SelectItem value="10" lang={languageFor("Trace+")} dir={directionFor("Trace+")}>
              {t("Trace+")}
            </SelectItem>
            <SelectItem value="20" lang={languageFor("Debug+")} dir={directionFor("Debug+")}>
              {t("Debug+")}
            </SelectItem>
            <SelectItem value="30" lang={languageFor("Info+")} dir={directionFor("Info+")}>
              {t("Info+")}
            </SelectItem>
            <SelectItem value="40" lang={languageFor("Warn+")} dir={directionFor("Warn+")}>
              {t("Warn+")}
            </SelectItem>
            <SelectItem value="50" lang={languageFor("Error+")} dir={directionFor("Error+")}>
              {t("Error+")}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label={t("Filter by module")}
            lang={languageFor("Filter by module")}
            dir={directionFor("Filter by module")}
          >
            <SelectValue placeholder={t("Module")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="all"
              lang={languageFor("All modules")}
              dir={directionFor("All modules")}
            >
              {t("All modules")}
            </SelectItem>
            {modules.map((module) => (
              <SelectItem key={module} value={module} lang="und" dir="auto">
                {module}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder={t("Search message or any JSON field")}
            lang={languageFor("Search message or any JSON field")}
            dir={directionFor("Search message or any JSON field")}
            className="pl-9"
            aria-label={t("Search log lines")}
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
          aria-label={t("Server log output")}
          lang={languageFor("Server log output")}
          dir={directionFor("Server log output")}
          aria-live="polite"
          aria-relevant="additions text"
          data-testid="logs-viewport"
        >
          {filteredLines.length === 0 && (
            <p
              className="p-3 pt-8 text-center text-zinc-500"
              lang={languageFor("No log lines to display.")}
              dir={directionFor("No log lines to display.")}
            >
              {t("No log lines to display.")}
            </p>
          )}
          {filteredLines.length > 0 && (
            <div className={isMobile ? "space-y-3 p-3" : "min-w-max p-3"}>
              {!isMobile && (
                <>
                  <div className="mb-2 grid grid-cols-[5rem_4rem_6.5rem_minmax(18rem,2fr)_minmax(14rem,1.6fr)] gap-2 px-1 text-[11px] uppercase tracking-wide text-zinc-500">
                    <span
                      className="text-right"
                      lang={languageFor("Time")}
                      dir={directionFor("Time")}
                    >
                      {t("Time")}
                    </span>
                    <span
                      className="text-center"
                      lang={languageFor("Level")}
                      dir={directionFor("Level")}
                    >
                      {t("Level")}
                    </span>
                    <span lang={languageFor("Module")} dir={directionFor("Module")}>
                      {t("Module")}
                    </span>
                    <span lang={languageFor("Message")} dir={directionFor("Message")}>
                      {t("Message")}
                    </span>
                    <span lang={languageFor("Context")} dir={directionFor("Context")}>
                      {t("Context")}
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
