import RssFeedList from "@/components/RssFeedList";
import RssSettings from "@/components/RssSettings";
import { useInterfaceLanguage } from "@/lib/interface-locale";

export default function RssPage() {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            lang={languageFor("RSS Feeds")}
            dir={directionFor("RSS Feeds")}
          >
            {t("RSS Feeds")}
          </h1>
          <p
            className="text-muted-foreground text-sm mt-0.5"
            lang={languageFor("Browse and manage RSS feeds to automatically track releases.")}
            dir={directionFor("Browse and manage RSS feeds to automatically track releases.")}
          >
            {t("Browse and manage RSS feeds to automatically track releases.")}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <RssSettings />
        </div>
      </div>

      <RssFeedList />
    </div>
  );
}
