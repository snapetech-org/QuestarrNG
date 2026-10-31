import React, { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowUpCircle } from "lucide-react";
import { useInterfaceLanguage } from "@/lib/interface-locale";

interface SearchResultsBadgeProps {
  visible: boolean;
  updatesAvailable?: boolean;
  variant?: "overlay" | "inline";
}

const SearchResultsBadge = memo(
  ({ visible, updatesAvailable = false, variant = "overlay" }: SearchResultsBadgeProps) => {
    const { t, languageFor, directionFor } = useInterfaceLanguage();
    if (!visible && !updatesAvailable) return null;

    const labelKey = updatesAvailable
      ? "Game updates available on indexers"
      : "Downloads available on indexers";
    const resultKey = updatesAvailable ? "Updates" : "Results";
    const Icon = updatesAvailable ? ArrowUpCircle : Search;

    if (variant === "overlay") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              className="absolute bottom-2 start-2 bg-violet-500/90 hover:bg-violet-500/90 text-white border-violet-600 gap-1 text-[10px] py-0 px-1.5 cursor-default no-default-hover-elevate no-default-active-elevate"
              aria-label={t(labelKey)}
              lang={languageFor(labelKey)}
              dir={directionFor(labelKey)}
              role="status"
            >
              <Icon className="w-2.5 h-2.5" aria-hidden="true" />
              <span lang={languageFor(resultKey)} dir={directionFor(resultKey)}>
                {t(resultKey)}
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <span lang={languageFor(labelKey)} dir={directionFor(labelKey)}>
              {t(labelKey)}
            </span>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-500 text-white shrink-0 inline-flex"
            aria-label={t(labelKey)}
            lang={languageFor(labelKey)}
            dir={directionFor(labelKey)}
            role="status"
          >
            <Icon className="w-3 h-3" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span lang={languageFor(labelKey)} dir={directionFor(labelKey)}>
            {t(labelKey)}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }
);

SearchResultsBadge.displayName = "SearchResultsBadge";
export default SearchResultsBadge;
