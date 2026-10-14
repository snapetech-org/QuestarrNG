import React from "react";
import { LayoutGrid, List, Rows2, Rows3 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

interface ViewControlsToolbarProps {
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  listDensity: "comfortable" | "compact";
  onListDensityChange: (density: "comfortable" | "compact") => void;
}

export default function ViewControlsToolbar({
  viewMode,
  onViewModeChange,
  listDensity,
  onListDensityChange,
}: ViewControlsToolbarProps) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  const toggleDensity = () =>
    onListDensityChange(listDensity === "comfortable" ? "compact" : "comfortable");

  return (
    <>
      {viewMode === "list" && (
        <span className="hidden sm:contents">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={toggleDensity}>
                {listDensity === "comfortable" ? (
                  <Rows3 className="h-3.5 w-3.5" />
                ) : (
                  <Rows2 className="h-3.5 w-3.5" />
                )}
                <span className="sr-only sm:not-sr-only sm:inline-block">
                  <span
                    lang={languageFor(listDensity === "comfortable" ? "Comfortable" : "Compact")}
                    dir={directionFor(listDensity === "comfortable" ? "Comfortable" : "Compact")}
                  >
                    {t(listDensity === "comfortable" ? "Comfortable" : "Compact")}
                  </span>
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span
                lang={languageFor("Switch to {density}")}
                dir={directionFor("Switch to {density}")}
              >
                {formatInterfaceMessage("Switch to {density}", {
                  density: t(listDensity === "comfortable" ? "Compact" : "Comfortable"),
                })}
              </span>
            </TooltipContent>
          </Tooltip>
        </span>
      )}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => value && onViewModeChange(value as "grid" | "list")}
      >
        <ToggleGroupItem
          value="grid"
          aria-label={t("Grid View")}
          lang={languageFor("Grid View")}
          dir={directionFor("Grid View")}
        >
          <LayoutGrid className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="list"
          aria-label={t("List View")}
          lang={languageFor("List View")}
          dir={directionFor("List View")}
        >
          <List className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </>
  );
}
