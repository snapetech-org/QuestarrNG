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
            aria-label={t("interface.show_games_with_search_results_onl_5166ca5d")}
            lang={languageFor("interface.show_games_with_search_results_onl_5166ca5d")}
            dir={directionFor("interface.show_games_with_search_results_onl_5166ca5d")}
          >
            <Search className="h-3 w-3" />
            <span
              className="hidden sm:inline"
              lang={languageFor("interface.has_results_949261d1")}
              dir={directionFor("interface.has_results_949261d1")}
            >
              {t("interface.has_results_949261d1")}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className="sm:hidden"
          lang={languageFor("interface.has_results_949261d1")}
          dir={directionFor("interface.has_results_949261d1")}
        >
          {t("interface.has_results_949261d1")}
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
              lang={languageFor("interface.has_downloads_7d16c302")}
              dir={directionFor("interface.has_downloads_7d16c302")}
            >
              {t("interface.has_downloads_7d16c302")}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          className="sm:hidden"
          lang={languageFor("interface.has_downloads_7d16c302")}
          dir={directionFor("interface.has_downloads_7d16c302")}
        >
          {t("interface.has_downloads_7d16c302")}
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
                lang={languageFor("interface.update_available_c803387f")}
                dir={directionFor("interface.update_available_c803387f")}
              >
                {t("interface.update_available_c803387f")}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            className="sm:hidden"
            lang={languageFor("interface.update_available_c803387f")}
            dir={directionFor("interface.update_available_c803387f")}
          >
            {t("interface.update_available_c803387f")}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
