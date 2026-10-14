import { LayoutGrid, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GRID_COLUMNS_MIN, GRID_COLUMNS_MAX } from "@/hooks/use-grid-columns";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

interface GridColumnsControlProps {
  readonly columns: number;
  readonly onColumnsChange: (value: number[]) => void;
}

/** The "Configure grid columns" popover/slider shared by the Library, Wishlist, and Playing toolbars. */
export default function GridColumnsControl({ columns, onColumnsChange }: GridColumnsControlProps) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t("Configure grid columns")}
          lang={languageFor("Configure grid columns")}
          dir={directionFor("Configure grid columns")}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label
              className="flex items-center gap-2 text-sm font-medium"
              lang={languageFor("Grid Columns")}
              dir={directionFor("Grid Columns")}
            >
              <LayoutGrid className="h-4 w-4" />
              {t("Grid Columns")}
            </Label>
            <span className="w-4 text-center text-sm font-bold">{columns}</span>
          </div>
          <Slider
            value={[columns]}
            onValueChange={onColumnsChange}
            min={GRID_COLUMNS_MIN}
            max={GRID_COLUMNS_MAX}
            step={1}
            aria-label={t("Grid columns")}
            lang={languageFor("Grid columns")}
            dir={directionFor("Grid columns")}
          />
          <p
            className="text-xs text-muted-foreground"
            lang={languageFor("Number of columns in the game grid ({min}-{max}).")}
            dir={directionFor("Number of columns in the game grid ({min}-{max}).")}
          >
            {formatInterfaceMessage("Number of columns in the game grid ({min}-{max}).", {
              min: GRID_COLUMNS_MIN,
              max: GRID_COLUMNS_MAX,
            })}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
