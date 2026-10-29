import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ImportConfig, RomMConfig } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FolderOpen, Package, File } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { FileBrowser } from "./FileBrowser";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

interface ImportReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloadId: string;
  downloadTitle: string;
  /** True when this download's last extraction attempt failed because the archive is
   * password-protected — shows a required password field and pre-enables Unpack Archive
   * instead of the normal path-review form. */
  passwordRequired?: boolean;
}

export default function ImportReviewModal({
  open,
  onOpenChange,
  downloadId,
  downloadTitle,
  passwordRequired = false,
}: Readonly<ImportReviewModalProps>) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const localizedText = (source: string, values: Record<string, string | number> = {}) => {
    const text = formatInterfaceMessage(source, values, language);
    // The document already identifies English. Keep English toast payloads as
    // strings so consumers and tests don't receive redundant direction wrappers.
    if (language === "en") return text;
    return (
      <span lang={languageFor(source)} dir={directionFor(source)}>
        {text}
      </span>
    );
  };

  const { data: importConfig } = useQuery<ImportConfig>({
    queryKey: ["/api/imports/config"],
  });
  const { data: rommConfig } = useQuery<RomMConfig>({ queryKey: ["/api/imports/romm"] });

  // State
  const [strategy, setStrategy] = useState<"pc" | "romm">("pc");
  const [sourcePath, setSourcePath] = useState("");
  const [destinationPath, setDestinationPath] = useState("");
  const [transferMode, setTransferMode] = useState<"move" | "copy" | "hardlink" | "symlink">(
    "move"
  );
  const [unpackArchive, setUnpackArchive] = useState(false);
  const [password, setPassword] = useState("");
  const [isSourceBrowserOpen, setIsSourceBrowserOpen] = useState(false);
  const [isDestBrowserOpen, setIsDestBrowserOpen] = useState(false);

  const planApplied = useRef(false);

  const planUrl = `/api/imports/${downloadId}/plan?strategy=${strategy}${sourcePath ? `&sourcePath=${encodeURIComponent(sourcePath)}` : ""}`;

  const { data: planData } = useQuery<{
    originalPath: string;
    proposedPath: string;
    files: Array<{ name: string; isArchive: boolean }>;
    hasArchive: boolean;
    totalCount: number;
  }>({
    queryKey: [planUrl],
    enabled: open,
    retry: false,
    staleTime: 30_000,
  });

  // Reset state on open, defaulting transfer mode to the user's configured setting
  useEffect(() => {
    if (open) {
      planApplied.current = false;
      setStrategy("pc");
      setSourcePath("");
      setDestinationPath(importConfig?.libraryRoot ?? "");
      setTransferMode(importConfig?.transferMode ?? "move");
      // A password-required retry always needs to re-run extraction, so pre-enable Unpack
      // Archive rather than making the user notice and flip it on themselves.
      setUnpackArchive(passwordRequired);
      setPassword("");
    }
  }, [open, downloadId, importConfig?.libraryRoot, importConfig?.transferMode, passwordRequired]);

  useEffect(() => {
    planApplied.current = false;
    if (strategy === "romm") {
      setDestinationPath(rommConfig?.libraryRoot ?? "");
      setTransferMode(rommConfig?.moveMode ?? "move");
    } else {
      setDestinationPath(importConfig?.libraryRoot ?? "");
      setTransferMode(importConfig?.transferMode ?? "move");
    }
  }, [
    strategy,
    rommConfig?.libraryRoot,
    rommConfig?.moveMode,
    importConfig?.libraryRoot,
    importConfig?.transferMode,
  ]);

  useEffect(() => {
    planApplied.current = false;
  }, [sourcePath, strategy]);

  // Pre-fill paths from plan once when it loads
  useEffect(() => {
    if (open && planData && !planApplied.current) {
      planApplied.current = true;
      if (planData.originalPath) setSourcePath(planData.originalPath);
      if (planData.proposedPath) setDestinationPath(planData.proposedPath);
    }
  }, [open, planData]);

  const skipMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/imports/${downloadId}`);
    },
    onSuccess: () => {
      toast({ description: localizedText("interface.import_skipped_b1a594b0") });
      queryClient.invalidateQueries({ queryKey: ["/api/imports/pending"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: localizedText("interface.failed_to_skip_import_c4cf8271"),
        description: (
          <span lang="und" dir="auto">
            {error.message}
          </span>
        ),
        variant: "destructive",
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/imports/${downloadId}/confirm`, {
        strategy,
        proposedPath: destinationPath,
        ...(sourcePath ? { originalPath: sourcePath } : {}),
        transferMode,
        unpack: unpackArchive,
        ...(unpackArchive && password ? { password } : {}),
      });
    },
    onSuccess: () => {
      toast({
        title: localizedText("interface.import_confirmed_59dfe215"),
        description: localizedText("interface.the_import_has_been_queued_for_exe_71265dc3"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/imports/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/downloads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      onOpenChange(false);
    },
    onError: (error: Error & { data?: { passwordRequired?: boolean } }) => {
      toast({
        title: localizedText(error.data?.passwordRequired ? "Incorrect Password" : "Import Failed"),
        description: (
          <span lang="und" dir="auto">
            {error.message}
          </span>
        ),
        variant: "destructive",
      });
    },
  });

  const handleConfirm = () => {
    if (!destinationPath) {
      toast({
        title: localizedText("interface.validation_error_f956c8d8"),
        description: localizedText("interface.destination_path_is_required_9a8601f7"),
        variant: "destructive",
      });
      return;
    }
    if (passwordRequired && !password) {
      toast({
        title: localizedText("interface.validation_error_f956c8d8"),
        description: localizedText(
          "interface.this_archive_is_password_protected_727f2e86"
        ),
        variant: "destructive",
      });
      return;
    }
    const libraryRoot =
      strategy === "romm" ? (rommConfig?.libraryRoot ?? "") : (importConfig?.libraryRoot ?? "");
    if (libraryRoot && destinationPath === libraryRoot) {
      toast({
        title: localizedText("interface.validation_error_f956c8d8"),
        description: localizedText(
          "interface.destination_must_be_a_subfolder_in_2a1d69f4",
          { path: libraryRoot }
        ),
        variant: "destructive",
      });
      return;
    }
    confirmMutation.mutate();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle
              lang={languageFor(passwordRequired ? "Password Required" : "Review Import")}
              dir={directionFor(passwordRequired ? "Password Required" : "Review Import")}
            >
              {t(passwordRequired ? "Password Required" : "Review Import")}
            </DialogTitle>
            <DialogDescription
              lang={languageFor(
                passwordRequired
                  ? "{title} is a password-protected archive. Enter the password to extract and import it."
                  : "Manually configure the import for {title}."
              )}
              dir={directionFor(
                passwordRequired
                  ? "{title} is a password-protected archive. Enter the password to extract and import it."
                  : "Manually configure the import for {title}."
              )}
            >
              {passwordRequired
                ? formatInterfaceMessage(
                    "interface.title_is_a_password_protected_arch_164fd8c9",
                    { title: downloadTitle },
                    language
                  )
                : formatInterfaceMessage(
                    "interface.manually_configure_the_import_for_1daa7327",
                    { title: downloadTitle },
                    language
                  )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {rommConfig?.enabled && (
              <div className="space-y-2">
                <Label
                  lang={languageFor("interface.import_destination_f5fb664c")}
                  dir={directionFor("interface.import_destination_f5fb664c")}
                >
                  {t("interface.import_destination_f5fb664c")}
                </Label>
                <Select
                  value={strategy}
                  onValueChange={(value) => setStrategy(value as "pc" | "romm")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="pc"
                      lang={languageFor("interface.pc_game_library_d027b835")}
                      dir={directionFor("interface.pc_game_library_d027b835")}
                    >
                      {t("interface.pc_game_library_d027b835")}
                    </SelectItem>
                    <SelectItem
                      value="romm"
                      lang={languageFor("interface.romm_rom_library_729f2cfd")}
                      dir={directionFor("interface.romm_rom_library_729f2cfd")}
                    >
                      {t("interface.romm_rom_library_729f2cfd")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Source Path */}
            <div className="space-y-2">
              <Label
                htmlFor="import-review-source-path"
                lang={languageFor("interface.source_path_901bc31f")}
                dir={directionFor("interface.source_path_901bc31f")}
              >
                {t("interface.source_path_901bc31f")}{" "}
                <span
                  className="text-xs text-muted-foreground font-normal"
                  lang={languageFor("interface.optional_auto_resolved_from_downlo_c3c7ac1b")}
                  dir={directionFor("interface.optional_auto_resolved_from_downlo_c3c7ac1b")}
                >
                  {t("interface.optional_auto_resolved_from_downlo_c3c7ac1b")}
                </span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="import-review-source-path"
                  aria-describedby="import-review-source-path-help"
                  value={sourcePath}
                  onChange={(e) => setSourcePath(e.target.value)}
                  placeholder={t("interface.auto_resolved_from_download_client_40761bc4")}
                  lang="und"
                  dir="auto"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("interface.browse_source_directories_7eb8620b")}
                  lang={languageFor("interface.browse_source_directories_7eb8620b")}
                  dir={directionFor("interface.browse_source_directories_7eb8620b")}
                  onClick={() => setIsSourceBrowserOpen(true)}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p
                id="import-review-source-path-help"
                role="note"
                className="text-xs text-amber-400/90"
              >
                {t(
                  "interface.this_is_the_exact_file_or_folder_q_01c49a1c"
                )}
              </p>
            </div>

            {/* Destination Path */}
            <div className="space-y-2">
              <Label
                htmlFor="import-review-destination-path"
                lang={languageFor("interface.destination_path_1f6ff88e")}
                dir={directionFor("interface.destination_path_1f6ff88e")}
              >
                {t("interface.destination_path_1f6ff88e")}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="import-review-destination-path"
                  value={destinationPath}
                  onChange={(e) => setDestinationPath(e.target.value)}
                  placeholder="/path/to/library"
                  lang="und"
                  dir="auto"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("interface.browse_destination_directories_a2debe64")}
                  lang={languageFor("interface.browse_destination_directories_a2debe64")}
                  dir={directionFor("interface.browse_destination_directories_a2debe64")}
                  onClick={() => setIsDestBrowserOpen(true)}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {planData?.files && planData.files.length > 0 && (
              <div className="space-y-1.5">
                <Label
                  lang={languageFor("interface.download_contents_2604161d")}
                  dir={directionFor("interface.download_contents_2604161d")}
                >
                  {t("interface.download_contents_2604161d")}
                </Label>
                <ScrollArea className="h-32 rounded-md border p-2">
                  <div className="space-y-0.5">
                    {planData.files.map((f) => (
                      <div key={f.name} className="flex items-center gap-1.5 text-xs">
                        {f.isArchive ? (
                          <Package className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        ) : (
                          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span
                          className={f.isArchive ? "text-amber-400" : "text-muted-foreground"}
                          lang="und"
                          dir="auto"
                        >
                          {f.name}
                        </span>
                      </div>
                    ))}
                    {planData.totalCount > planData.files.length && (
                      <p
                        className="text-xs text-muted-foreground pt-0.5"
                        lang={languageFor(
                          planData.totalCount - planData.files.length === 1
                            ? "…and {count} more file not shown"
                            : "…and {count} more files not shown"
                        )}
                        dir={directionFor(
                          planData.totalCount - planData.files.length === 1
                            ? "…and {count} more file not shown"
                            : "…and {count} more files not shown"
                        )}
                      >
                        {planData.totalCount - planData.files.length === 1
                          ? formatInterfaceMessage(
                              "interface.and_count_more_file_not_shown_a4a35a44",
                              { count: 1 },
                              language
                            )
                          : formatInterfaceMessage(
                              "interface.and_count_more_files_not_shown_9e72f6fd",
                              { count: planData.totalCount - planData.files.length },
                              language
                            )}
                      </p>
                    )}
                  </div>
                </ScrollArea>
                {planData.hasArchive && (
                  <p
                    className="text-xs text-amber-400/80"
                    lang={languageFor(
                      "interface.archive_files_detected_consider_en_c51932b4"
                    )}
                    dir={directionFor(
                      "interface.archive_files_detected_consider_en_c51932b4"
                    )}
                  >
                    {t("interface.archive_files_detected_consider_en_c51932b4")}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label lang={languageFor("interface.transfer_mode_e53bc979")} dir={directionFor("interface.transfer_mode_e53bc979")}>
                {t("interface.transfer_mode_e53bc979")}
              </Label>
              <Select
                value={transferMode}
                onValueChange={(value) =>
                  setTransferMode(value as "move" | "copy" | "hardlink" | "symlink")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="move" lang={languageFor("interface.move_7f2c2a34")} dir={directionFor("interface.move_7f2c2a34")}>
                    {t("interface.move_7f2c2a34")}
                  </SelectItem>
                  <SelectItem value="copy" lang={languageFor("interface.copy_658f3664")} dir={directionFor("interface.copy_658f3664")}>
                    {t("interface.copy_658f3664")}
                  </SelectItem>
                  <SelectItem
                    value="hardlink"
                    lang={languageFor("interface.hardlink_ffb8718c")}
                    dir={directionFor("interface.hardlink_ffb8718c")}
                  >
                    {t("interface.hardlink_ffb8718c")}
                  </SelectItem>
                  <SelectItem
                    value="symlink"
                    lang={languageFor("interface.symlink_9b0a04f4")}
                    dir={directionFor("interface.symlink_9b0a04f4")}
                  >
                    {t("interface.symlink_9b0a04f4")}
                  </SelectItem>
                </SelectContent>
              </Select>
              {transferMode === "hardlink" && (
                <p
                  className="text-xs text-muted-foreground"
                  lang={languageFor(
                    "interface.uses_a_hardlink_when_both_folders_73d30feb"
                  )}
                  dir={directionFor(
                    "interface.uses_a_hardlink_when_both_folders_73d30feb"
                  )}
                >
                  {t(
                    "interface.uses_a_hardlink_when_both_folders_73d30feb"
                  )}
                </p>
              )}
              {transferMode === "symlink" && (
                <p
                  className="text-xs text-muted-foreground"
                  lang={languageFor(
                    "interface.works_across_different_volumes_but_240a7fdd"
                  )}
                  dir={directionFor(
                    "interface.works_across_different_volumes_but_240a7fdd"
                  )}
                >
                  {t(
                    "interface.works_across_different_volumes_but_240a7fdd"
                  )}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label lang={languageFor("interface.unpack_archive_505028c1")} dir={directionFor("interface.unpack_archive_505028c1")}>
                  {t("interface.unpack_archive_505028c1")}
                </Label>
                <p
                  className="text-xs text-muted-foreground"
                  lang={languageFor("interface.extract_zip_rar_7z_before_placing_2171d0e1")}
                  dir={directionFor("interface.extract_zip_rar_7z_before_placing_2171d0e1")}
                >
                  {t("interface.extract_zip_rar_7z_before_placing_2171d0e1")}
                </p>
              </div>
              <Switch
                checked={unpackArchive}
                onCheckedChange={setUnpackArchive}
                disabled={passwordRequired}
              />
            </div>

            {unpackArchive && (
              <div className="space-y-2">
                <Label
                  htmlFor="import-review-password"
                  lang={languageFor("interface.archive_password_18e15856")}
                  dir={directionFor("interface.archive_password_18e15856")}
                >
                  {t("interface.archive_password_18e15856")}
                  {!passwordRequired && t("interface.optional_3f7db380")}
                </Label>
                <Input
                  id="import-review-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("interface.password_2cc30838")}
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <span lang={languageFor("interface.cancel_35afca3b")} dir={directionFor("interface.cancel_35afca3b")}>
                {t("interface.cancel_35afca3b")}
              </span>
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending || confirmMutation.isPending}
            >
              {skipMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <span lang={languageFor("interface.skip_import_97b4a64b")} dir={directionFor("interface.skip_import_97b4a64b")}>
                {t("interface.skip_import_97b4a64b")}
              </span>
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={confirmMutation.isPending || skipMutation.isPending}
            >
              {confirmMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <span lang={languageFor("interface.confirm_import_f53eb8fc")} dir={directionFor("interface.confirm_import_f53eb8fc")}>
                {t("interface.confirm_import_f53eb8fc")}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FileBrowser
        open={isSourceBrowserOpen}
        onOpenChange={setIsSourceBrowserOpen}
        onSelect={(path) => setSourcePath(path)}
        initialPath="/"
        title={t("interface.select_source_3ec679e2")}
        root="/"
      />
      <FileBrowser
        open={isDestBrowserOpen}
        onOpenChange={setIsDestBrowserOpen}
        onSelect={(path) => setDestinationPath(path)}
        initialPath="/"
        title={t("interface.select_destination_1e0a462d")}
        root={strategy === "romm" ? (rommConfig?.libraryRoot ?? "/") : "/"}
      />
    </>
  );
}
