import React, { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { useInterfaceLanguage } from "@/lib/interface-locale";

interface SearchResultsBadgeProps {
  visible: boolean;
  variant?: "overlay" | "inline";
}

const SearchResultsBadge = memo(({ visible, variant = "overlay" }: SearchResultsBadgeProps) => {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  if (!visible) return null;

  if (variant === "overlay") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            className="absolute bottom-2 left-2 bg-violet-500/90 hover:bg-violet-500/90 text-white border-violet-600 gap-1 text-[10px] py-0 px-1.5 cursor-default no-default-hover-elevate no-default-active-elevate"
            aria-label={t("Downloads available on indexers")}
            lang={languageFor("Downloads available on indexers")}
            dir={directionFor("Downloads available on indexers")}
            role="status"
          >
            <Search className="w-2.5 h-2.5" />
            <span lang={languageFor("Results")} dir={directionFor("Results")}>
              {t("Results")}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <span
            lang={languageFor("Downloads available on indexers")}
            dir={directionFor("Downloads available on indexers")}
          >
            {t("Downloads available on indexers")}
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
          aria-label={t("Downloads available on indexers")}
          lang={languageFor("Downloads available on indexers")}
          dir={directionFor("Downloads available on indexers")}
          role="status"
        >
          <Search className="w-3 h-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span
          lang={languageFor("Downloads available on indexers")}
          dir={directionFor("Downloads available on indexers")}
        >
          {t("Downloads available on indexers")}
        </span>
      </TooltipContent>
    </Tooltip>
  );
});

SearchResultsBadge.displayName = "SearchResultsBadge";
export default SearchResultsBadge;
