import React from "react";
import { Search, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useInterfaceLanguage } from "@/lib/interface-locale";

interface GameFilterPillsProps {
  showSearchResultsOnly: boolean;
  setShowSearchResultsOnly: (value: boolean) => void;
  showDownloadsOnly: boolean;
  setShowDownloadsOnly: (value: boolean | ((prev: boolean) => boolean)) => void;
  showUpdateAvailableOnly?: boolean;
  setShowUpdateAvailableOnly?: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export default function GameFilterPills({
  showSearchResultsOnly,
  setShowSearchResultsOnly,
  showDownloadsOnly,
  setShowDownloadsOnly,
  showUpdateAvailableOnly = false,
  setShowUpdateAvailableOnly,
}: Readonly<GameFilterPillsProps>) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showSearchResultsOnly ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowSearchResultsOnly(!showSearchResultsOnly)}
            aria-label={t("Show games with search results only")}
            lang={languageFor("Show games with search results only")}
            dir={directionFor("Show games with search results only")}
          >
            <Search className="h-3 w-3" />
            <span
              className="hidden sm:inline"
              lang={languageFor("Has Results")}
              dir={directionFor("Has Results")}
            >
              {t("Has Results")}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className="sm:hidden"
          lang={languageFor("Has Results")}
          dir={directionFor("Has Results")}
        >
          {t("Has Results")}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showDownloadsOnly ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowDownloadsOnly((v) => !v)}
            aria-label={t(showDownloadsOnly ? "Show all games" : "Show games with downloads only")}
            lang={languageFor(
              showDownloadsOnly ? "Show all games" : "Show games with downloads only"
            )}
            dir={directionFor(
              showDownloadsOnly ? "Show all games" : "Show games with downloads only"
            )}
          >
            <Download className="h-3 w-3" />
            <span
              className="hidden sm:inline"
              lang={languageFor("Has Downloads")}
              dir={directionFor("Has Downloads")}
            >
              {t("Has Downloads")}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className="sm:hidden"
          lang={languageFor("Has Downloads")}
          dir={directionFor("Has Downloads")}
        >
          {t("Has Downloads")}
        </TooltipContent>
      </Tooltip>
      {setShowUpdateAvailableOnly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showUpdateAvailableOnly ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowUpdateAvailableOnly((v) => !v)}
              aria-label={t(
                showUpdateAvailableOnly ? "Show all games" : "Show games with update downloads only"
              )}
              lang={languageFor(
                showUpdateAvailableOnly ? "Show all games" : "Show games with update downloads only"
              )}
              dir={directionFor(
                showUpdateAvailableOnly ? "Show all games" : "Show games with update downloads only"
              )}
            >
              <RefreshCw className="h-3 w-3" />
              <span
                className="hidden sm:inline"
                lang={languageFor("Update Available")}
                dir={directionFor("Update Available")}
              >
                {t("Update Available")}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            className="sm:hidden"
            lang={languageFor("Update Available")}
            dir={directionFor("Update Available")}
          >
            {t("Update Available")}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
