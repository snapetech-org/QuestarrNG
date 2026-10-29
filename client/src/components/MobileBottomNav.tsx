import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useInterfaceLanguage } from "@/lib/interface-locale";
import { cn } from "@/lib/utils";
import {
  mobileBottomNavigation,
  primaryNavigation,
  managementNavigation,
  activityNavigation,
  flattenNavigation,
  type AppNavItem,
} from "@/components/navigation-items";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface MobileBottomNavProps {
  activeItem: string;
  onNavigate: (url: string) => void;
}

const pinnedUrls = new Set(mobileBottomNavigation.map((i) => i.url));

// Flatten so nested entries (e.g. Wishlist under Library, xREL/RSS under Discover) still surface here.
const morePages: AppNavItem[] = flattenNavigation(primaryNavigation).filter(
  (i) => !pinnedUrls.has(i.url)
);

const isMoreActive = (activeItem: string) =>
  !pinnedUrls.has(activeItem) && activeItem !== "/login" && activeItem !== "/setup";

export default function MobileBottomNav({
  activeItem,
  onNavigate,
}: Readonly<MobileBottomNavProps>) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { t, tId, languageFor, directionFor, languageForId, directionForId } =
    useInterfaceLanguage();

  const handleNavigate = (url: string) => {
    setMoreOpen(false);
    onNavigate(url);
  };

  const navigationText = (item: AppNavItem) =>
    item.messageId ? tId(item.messageId) : t(item.title);
  const navigationLanguage = (item: AppNavItem) =>
    item.messageId ? languageForId(item.messageId) : languageFor(item.title);
  const navigationDirection = (item: AppNavItem) =>
    item.messageId ? directionForId(item.messageId) : directionFor(item.title);

  const moreActive = isMoreActive(activeItem);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border/80 bg-background/95 px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_24px_hsl(var(--background)/0.35)] backdrop-blur-lg md:hidden"
        aria-label={t("interface.primary_navigation_6fba33cd")}
        lang={languageFor("interface.primary_navigation_6fba33cd")}
        dir={directionFor("interface.primary_navigation_6fba33cd")}
      >
        <div className="grid grid-cols-5 gap-1">
          {mobileBottomNavigation.map((item) => {
            const isActive = activeItem === item.url;
            return (
              <button
                key={item.url}
                type="button"
                onClick={() => onNavigate(item.url)}
                className={cn(
                  "group flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
                aria-label={navigationText(item)}
                lang={navigationLanguage(item)}
                dir={navigationDirection(item)}
              >
                <span
                  className={cn(
                    "flex h-7 min-w-10 items-center justify-center rounded-full px-3 transition-colors",
                    isActive && "bg-primary/15"
                  )}
                  aria-hidden="true"
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <span
                  className="max-w-full truncate leading-4"
                  lang={navigationLanguage(item)}
                  dir={navigationDirection(item)}
                >
                  {navigationText(item)}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "group flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              moreActive
                ? "text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
            aria-label={t("interface.more_navigation_options_703c75c8")}
            lang={languageFor("interface.more_navigation_options_703c75c8")}
            dir={directionFor("interface.more_navigation_options_703c75c8")}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-navigation"
          >
            <span
              className={cn(
                "flex h-7 min-w-10 items-center justify-center rounded-full px-3 transition-colors",
                moreActive && "bg-primary/15"
              )}
              aria-hidden="true"
            >
              <MoreHorizontal className="h-5 w-5" />
            </span>
            <span className="leading-4" lang={languageFor("navigation.more")} dir={directionFor("navigation.more")}>
              {t("navigation.more")}
            </span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          id="mobile-more-navigation"
          side="bottom"
          className="max-h-[70svh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="mb-4">
            <SheetTitle
              className="text-start text-sm font-semibold"
              lang={languageFor("navigation.more")}
              dir={directionFor("navigation.more")}
            >
              {t("navigation.more")}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <section
              aria-label={t("interface.pages_7decab7f")}
              lang={languageFor("interface.pages_7decab7f")}
              dir={directionFor("interface.pages_7decab7f")}
            >
              <p
                className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                lang={languageFor("interface.pages_7decab7f")}
                dir={directionFor("interface.pages_7decab7f")}
              >
                {t("interface.pages_7decab7f")}
              </p>
              <div className="grid grid-cols-1 gap-0.5">
                {morePages.map((item) => {
                  const isActive = activeItem === item.url;
                  return (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => handleNavigate(item.url)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted/60"
                      )}
                      aria-current={isActive ? "page" : undefined}
                      lang={navigationLanguage(item)}
                      dir={navigationDirection(item)}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span lang={navigationLanguage(item)} dir={navigationDirection(item)}>
                        {navigationText(item)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              aria-label={t("interface.management_da9fd136")}
              lang={languageFor("interface.management_da9fd136")}
              dir={directionFor("interface.management_da9fd136")}
            >
              <p
                className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                lang={languageFor("interface.management_da9fd136")}
                dir={directionFor("interface.management_da9fd136")}
              >
                {t("interface.management_da9fd136")}
              </p>
              <div className="grid grid-cols-1 gap-0.5">
                {managementNavigation.map((item) => {
                  const isActive = activeItem === item.url;
                  return (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => handleNavigate(item.url)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted/60"
                      )}
                      aria-current={isActive ? "page" : undefined}
                      lang={navigationLanguage(item)}
                      dir={navigationDirection(item)}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span lang={navigationLanguage(item)} dir={navigationDirection(item)}>
                        {navigationText(item)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              aria-label={t("interface.activity_9e75940c")}
              lang={languageFor("interface.activity_9e75940c")}
              dir={directionFor("interface.activity_9e75940c")}
            >
              <p
                className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                lang={languageFor("interface.activity_9e75940c")}
                dir={directionFor("interface.activity_9e75940c")}
              >
                {t("interface.activity_9e75940c")}
              </p>
              <div className="grid grid-cols-1 gap-0.5">
                {activityNavigation.map((item) => {
                  const isActive = activeItem === item.url;
                  return (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => handleNavigate(item.url)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted/60"
                      )}
                      aria-current={isActive ? "page" : undefined}
                      lang={navigationLanguage(item)}
                      dir={navigationDirection(item)}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span lang={navigationLanguage(item)} dir={navigationDirection(item)}>
                        {navigationText(item)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
