import { getRegionalLocale } from "@/lib/regional-format";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CheckCircle, AlertTriangle, XCircle, Clock, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { getSocket } from "@/lib/socket";
import type { ImportTask, ImportTaskItem } from "@shared/schema";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

const TASK_TYPE_LABELS: Record<string, string> = {
  steam_wishlist: "Steam Wishlist",
  file_import: "File Import",
  bulk_add: "Scan Unlinked",
};

const RESULT_LABELS: Record<string, string> = {
  added: "Added",
  skipped: "Skipped",
  failed: "Failed",
  fuzzy_match: "Fuzzy Match",
};

const TRIGGERED_BY_LABELS: Record<string, string> = { manual: "Manual", system: "System" };

function StatusBadge({ status }: { status: string }) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  if (status === "completed") {
    return (
      <Badge className="bg-emerald-900/40 text-emerald-400 border-emerald-700/50 gap-1">
        <CheckCircle className="w-3 h-3" aria-hidden="true" />
        <span lang={languageFor("Completed")} dir={directionFor("Completed")}>
          {t("Completed")}
        </span>
      </Badge>
    );
  }
  if (status === "completed_with_errors") {
    return (
      <Badge className="bg-amber-900/40 text-amber-400 border-amber-700/50 gap-1">
        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
        <span lang={languageFor("With errors")} dir={directionFor("With errors")}>
          {t("With errors")}
        </span>
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="bg-red-900/40 text-red-400 border-red-700/50 gap-1">
        <XCircle className="w-3 h-3" aria-hidden="true" />
        <span lang={languageFor("Failed")} dir={directionFor("Failed")}>
          {t("Failed")}
        </span>
      </Badge>
    );
  }
  if (status === "in_progress") {
    return (
      <Badge className="bg-blue-900/40 text-blue-400 border-blue-700/50 gap-1">
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        <span lang={languageFor("In progress")} dir={directionFor("In progress")}>
          {t("In progress")}
        </span>
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-800 text-slate-400 border-slate-700 gap-1">
      <Clock className="w-3 h-3" aria-hidden="true" />
      <span lang={languageFor("Pending")} dir={directionFor("Pending")}>
        {t("Pending")}
      </span>
    </Badge>
  );
}

function ResultBadge({ result }: { result: string }) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  const colors: Record<string, string> = {
    added: "bg-emerald-900/40 text-emerald-400 border-emerald-700/50",
    skipped: "bg-slate-800 text-slate-400 border-slate-700",
    failed: "bg-red-900/40 text-red-400 border-red-700/50",
    fuzzy_match: "bg-amber-900/40 text-amber-400 border-amber-700/50",
  };
  return (
    <Badge className={colors[result] ?? "bg-slate-800 text-slate-400"}>
      {RESULT_LABELS[result] ? (
        <span lang={languageFor(RESULT_LABELS[result])} dir={directionFor(RESULT_LABELS[result])}>
          {t(RESULT_LABELS[result])}
        </span>
      ) : (
        <span lang="und" dir="auto">
          {result}
        </span>
      )}
    </Badge>
  );
}

function toMs(val: Date | string | number | null | undefined): number | null {
  if (val == null) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === "number") return val;
  return new Date(val).getTime();
}

function formatDuration(
  startedAt: Date | string | number | null | undefined,
  completedAt: Date | string | number | null | undefined
): string {
  const start = toMs(startedAt);
  if (!start) return "—";
  const end = toMs(completedAt) ?? Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function formatDate(ts: Date | string | number | null | undefined): string {
  const ms = toMs(ts);
  if (!ms) return "—";
  return new Date(ms).toLocaleString(getRegionalLocale());
}

type TaskWithItems = ImportTask & { items: ImportTaskItem[] };

export default function ImportHistoryPage() {
  const queryClient = useQueryClient();
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const header = (source: string) => (
    <span lang={languageFor(source)} dir={directionFor(source)}>
      {t(source)}
    </span>
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data: tasks = [] } = useQuery<ImportTask[]>({
    queryKey: ["/api/import-tasks"],
    refetchInterval: (query) => {
      const data = query.state.data as ImportTask[] | undefined;
      return data?.some((t) => t.status === "in_progress" || t.status === "pending") ? 3000 : false;
    },
  });

  const { data: selectedTask } = useQuery<TaskWithItems>({
    queryKey: ["/api/import-tasks", selectedTaskId],
    enabled: !!selectedTaskId,
    refetchInterval: (query) => {
      const data = query.state.data as TaskWithItems | undefined;
      return data?.status === "in_progress" || data?.status === "pending" ? 3000 : false;
    },
  });

  useEffect(() => {
    const socket = getSocket();
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/import-tasks"] });
    };
    socket.on("importTaskUpdate", handler);
    return () => {
      socket.off("importTaskUpdate", handler);
    };
  }, [queryClient]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#374151]/40">
        <ClipboardList className="w-5 h-5 text-blue-400" aria-hidden="true" />
        <h1
          className="text-xl font-semibold text-white"
          lang={languageFor("Import History")}
          dir={directionFor("Import History")}
        >
          {t("Import History")}
        </h1>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <ClipboardList className="w-10 h-10 mb-3 opacity-30" aria-hidden="true" />
            <p
              className="text-sm"
              lang={languageFor("No import tasks yet")}
              dir={directionFor("No import tasks yet")}
            >
              {t("No import tasks yet")}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-[#374151]/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#374151]/40 bg-[#111827]">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">
                    {header("Type")}
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">
                    {header("Triggered by")}
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">
                    {header("Status")}
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">
                    {header("Started")}
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">
                    {header("Created")}
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">
                    {header("Duration")}
                  </th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">
                    {header("Added")}
                  </th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">
                    {header("Skipped")}
                  </th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">
                    {header("Failed")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    className="border-b border-[#374151]/30 last:border-0 hover:bg-[#1F2937]/60 cursor-pointer transition-colors"
                    onClick={() => setSelectedTaskId(task.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelectedTaskId(task.id);
                    }}
                  >
                    <td className="px-4 py-3 text-white font-medium">
                      {TASK_TYPE_LABELS[task.taskType] ? (
                        <span
                          lang={languageFor(TASK_TYPE_LABELS[task.taskType]!)}
                          dir={directionFor(TASK_TYPE_LABELS[task.taskType]!)}
                        >
                          {t(TASK_TYPE_LABELS[task.taskType]!)}
                        </span>
                      ) : (
                        <span lang="und" dir="auto">
                          {task.taskType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 capitalize">
                      {TRIGGERED_BY_LABELS[task.triggeredBy] ? (
                        <span
                          lang={languageFor(TRIGGERED_BY_LABELS[task.triggeredBy]!)}
                          dir={directionFor(TRIGGERED_BY_LABELS[task.triggeredBy]!)}
                        >
                          {t(TRIGGERED_BY_LABELS[task.triggeredBy]!)}
                        </span>
                      ) : (
                        <span lang="und" dir="auto">
                          {task.triggeredBy}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDate(task.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDate(task.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDuration(task.startedAt, task.completedAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400">{task.addedItems}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{task.skippedItems}</td>
                    <td className="px-4 py-3 text-right text-red-400">{task.failedItems}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <SheetContent className="w-full sm:max-w-xl bg-[#111827] border-l border-[#374151]/40 overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-white">
              {selectedTask ? (
                TASK_TYPE_LABELS[selectedTask.taskType] ? (
                  <span
                    lang={languageFor(TASK_TYPE_LABELS[selectedTask.taskType]!)}
                    dir={directionFor(TASK_TYPE_LABELS[selectedTask.taskType]!)}
                  >
                    {t(TASK_TYPE_LABELS[selectedTask.taskType]!)}
                  </span>
                ) : (
                  <span lang="und" dir="auto">
                    {selectedTask.taskType}
                  </span>
                )
              ) : (
                <span lang={languageFor("Task detail")} dir={directionFor("Task detail")}>
                  {t("Task detail")}
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="text-slate-400">
              {selectedTask && (
                <span>
                  {formatDate(selectedTask.createdAt ? Number(selectedTask.createdAt) : null)} ·{" "}
                  {formatDuration(
                    selectedTask.startedAt ? Number(selectedTask.startedAt) : null,
                    selectedTask.completedAt ? Number(selectedTask.completedAt) : null
                  )}
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          {selectedTask && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <StatusBadge status={selectedTask.status} />
                <span
                  className="text-xs text-slate-500"
                  lang={languageFor(
                    "{total} total · {added} added · {skipped} skipped · {failed} failed"
                  )}
                  dir={directionFor(
                    "{total} total · {added} added · {skipped} skipped · {failed} failed"
                  )}
                >
                  {formatInterfaceMessage(
                    "{total} total · {added} added · {skipped} skipped · {failed} failed",
                    {
                      total: selectedTask.totalItems,
                      added: selectedTask.addedItems,
                      skipped: selectedTask.skippedItems,
                      failed: selectedTask.failedItems,
                    },
                    language
                  )}
                </span>
              </div>

              {selectedTask.errorMessage && (
                <div className="rounded-md bg-red-900/20 border border-red-700/30 px-3 py-2 text-sm text-red-400">
                  <span lang="und" dir="auto">
                    {selectedTask.errorMessage}
                  </span>
                </div>
              )}

              {selectedTask.items.length === 0 ? (
                <p
                  className="text-sm text-slate-500"
                  lang={languageFor("No item-level detail available.")}
                  dir={directionFor("No item-level detail available.")}
                >
                  {t("No item-level detail available.")}
                </p>
              ) : (
                <div className="space-y-1">
                  {selectedTask.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 py-2 border-b border-[#374151]/30 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate" lang="und" dir="auto">
                          {item.gameTitle ?? item.itemName}
                        </p>
                        {item.errorMessage && (
                          <p className="text-xs text-red-400 mt-0.5" lang="und" dir="auto">
                            {item.errorMessage}
                          </p>
                        )}
                      </div>
                      <ResultBadge result={item.result} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
