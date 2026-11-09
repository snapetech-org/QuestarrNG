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
            lang={languageFor("navigation.rss_feeds")}
            dir={directionFor("navigation.rss_feeds")}
          >
            {t("navigation.rss_feeds")}
          </h1>
          <p
            className="text-muted-foreground text-sm mt-0.5"
            lang={languageFor("interface.browse_and_manage_rss_feeds_to_aut_7b5c058b")}
            dir={directionFor("interface.browse_and_manage_rss_feeds_to_aut_7b5c058b")}
          >
            {t("interface.browse_and_manage_rss_feeds_to_aut_7b5c058b")}
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
