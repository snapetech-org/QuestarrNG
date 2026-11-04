import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InterfaceText } from "@/components/InterfaceText";

type ImportPreview = {
  totalCount: number;
  addCount: number;
  duplicateCount: number;
  addTitles: string[];
  duplicateTitles: string[];
};

const MAX_CATALOG_BYTES = 4 * 1024 * 1024;

async function responseError(response: Response, fallback: string): Promise<Error> {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  return new Error(typeof data.error === "string" ? data.error : fallback);
}

export function GameLibraryInterchange() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const exportLibrary = async () => {
    setIsWorking(true);
    try {
      const response = await apiRequest("GET", "/api/games/export");
      if (!response.ok) throw await responseError(response, "Failed to export game library");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `questarrng-library-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export game library",
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  };

  const inspectFile = async (file: File | undefined) => {
    setCatalog(null);
    setFileName("");
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_CATALOG_BYTES) {
      toast({
        title: "Catalog is too large",
        description: "Choose a QuestarrNG library export smaller than 4 MB.",
        variant: "destructive",
      });
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    setIsWorking(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const response = await apiRequest("POST", "/api/games/import/preview", parsed);
      if (!response.ok) throw await responseError(response, "This file is not a valid QuestarrNG library export");
      const data = (await response.json()) as ImportPreview;
      setCatalog(parsed);
      setFileName(file.name);
      setPreview(data);
    } catch (error) {
      toast({
        title: "Could not preview catalog",
        description: error instanceof Error ? error.message : "Choose a valid QuestarrNG library export.",
        variant: "destructive",
      });
      if (fileInput.current) fileInput.current.value = "";
    } finally {
      setIsWorking(false);
    }
  };

  const importNewGames = async () => {
    if (!catalog) return;
    setIsWorking(true);
    try {
      const response = await apiRequest("POST", "/api/games/import", catalog);
      if (!response.ok) throw await responseError(response, "Failed to import game library");
      const result = (await response.json()) as {
        success: boolean;
        addedCount: number;
        skippedCount: number;
        errorCount: number;
      };
      toast({
        title: result.errorCount > 0 ? "Import finished with errors" : "Import complete",
        description: `Added ${result.addedCount}; skipped ${result.skippedCount}; errors ${result.errorCount}.`,
        variant: result.errorCount > 0 ? "destructive" : "default",
      });
      setCatalog(null);
      setFileName("");
      setPreview(null);
      if (fileInput.current) fileInput.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["/api/games"] });
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import game library",
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <InterfaceText source={"QuestarrNG library JSON"} />
        </CardTitle>
        <CardDescription>
          <InterfaceText
            source={
              "Move your tracked game collection between QuestarrNG installs. The export contains game metadata and your status and rating; it does not contain files, server paths, downloads, or credentials."
            }
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" onClick={exportLibrary} disabled={isWorking}>
          {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          <InterfaceText source={"Export library"} />
        </Button>

        <div className="space-y-2">
          <label htmlFor="questarr-library-import" className="text-sm font-medium">
            <InterfaceText source={"Import a QuestarrNG library JSON file"} />
          </label>
          <input
            ref={fileInput}
            id="questarr-library-import"
            type="file"
            accept="application/json,.json"
            disabled={isWorking}
            onChange={(event) => void inspectFile(event.currentTarget.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            <InterfaceText
              source={"Import adds new games only. Existing entries are detected by provider ID or normalized title and release date; downloads are never started."}
            />
          </p>
        </div>

        {isWorking && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <InterfaceText source={"Working…"} />
          </p>
        )}

        {preview && (
          <div className="space-y-3 rounded-md border p-4" aria-live="polite">
            <div>
              <h3 className="font-medium">{fileName}</h3>
              <p className="text-sm text-muted-foreground">
                <InterfaceText source={"Total entries"} />: {preview.totalCount} ·{" "}
                <InterfaceText source={"New games to add"} />: {preview.addCount} ·{" "}
                <InterfaceText source={"Duplicates to skip"} />: {preview.duplicateCount}
              </p>
            </div>
            {preview.addTitles.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">
                  <InterfaceText source={"Will add"} />
                </p>
                <ul className="max-h-36 list-inside list-disc overflow-y-auto text-sm">
                  {preview.addTitles.map((title, index) => (
                    <li key={`${index}-${title}`}>{title}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.duplicateTitles.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">
                  <InterfaceText source={"Will skip as duplicates"} />
                </p>
                <ul className="max-h-36 list-inside list-disc overflow-y-auto text-sm text-muted-foreground">
                  {preview.duplicateTitles.map((title, index) => (
                    <li key={`${index}-${title}`}>{title}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button type="button" onClick={importNewGames} disabled={isWorking || preview.addCount === 0}>
              {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              <InterfaceText source={"Import new games"} />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
