import React, { memo } from "react";
import { ExternalLink, Calendar, Link } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RssFeedItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { safeUrl } from "@/lib/utils";
import { RegionalRelativeTime } from "./RegionalRelativeTime";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

interface CompactRssFeedItemProps {
  item: RssFeedItem;
}

const CompactRssFeedItem = ({ item }: CompactRssFeedItemProps) => {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <div
      className="group flex items-center gap-4 p-3 rounded-lg border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent/50"
      data-testid={`rss-item-compact-${item.id}`}
    >
      {/* Cover Image */}
      <div className="flex-shrink-0 relative w-16 h-24 rounded overflow-hidden bg-muted">
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt={item.igdbGameName || item.title}
            lang="und"
            dir="auto"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
            <Link className="h-6 w-6 opacity-20" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-grow min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-base truncate" title={item.title} lang="und" dir="auto">
            {item.title}
          </h3>
          <Badge variant="secondary" className="text-xs" lang="und" dir="auto">
            {item.sourceName}
          </Badge>
        </div>

        {item.igdbGameName && (
          <div
            className="text-xs text-muted-foreground truncate"
            lang={languageFor("Matched: {title}")}
            dir={directionFor("Matched: {title}")}
          >
            {formatInterfaceMessage("Matched: {title}", { title: item.igdbGameName }, language)}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto">
          {/* Pub Date */}
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {item.pubDate ? (
              <RegionalRelativeTime date={new Date(item.pubDate)} />
            ) : (
              <span lang={languageFor("Unknown date")} dir={directionFor("Unknown date")}>
                {t("Unknown date")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 self-center">
        <Button variant="outline" size="sm" className="h-8 gap-2" asChild>
          <a
            href={safeUrl(item.link)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={formatInterfaceMessage(
              "View original article for {title}",
              { title: item.title },
              language
            )}
            lang={languageFor("View original article for {title}")}
            dir={directionFor("View original article for {title}")}
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            <span
              className="hidden sm:inline"
              lang={languageFor("View")}
              dir={directionFor("View")}
            >
              {t("View")}
            </span>
          </a>
        </Button>
      </div>
    </div>
  );
};

export default memo(CompactRssFeedItem);
