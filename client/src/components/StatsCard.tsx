import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type IconComponent } from "@/types/components";
import { useInterfaceLanguage } from "@/lib/interface-locale";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: IconComponent;
  trend?: {
    value: number;
    label: string;
  };
}

export default function StatsCard({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <Card data-testid={`card-stats-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle
          className="text-sm font-medium"
          lang={languageFor(title)}
          dir={directionFor(title)}
        >
          {t(title)}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div
          className="text-2xl font-bold"
          lang="und"
          dir="auto"
          data-testid={`text-stats-value-${title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value}
        </div>
        {subtitle && (
          <p
            className="text-xs text-muted-foreground"
            lang={languageFor(subtitle)}
            dir={directionFor(subtitle)}
            data-testid={`text-stats-subtitle-${title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {t(subtitle)}
          </p>
        )}
        {trend && (
          <p
            className="text-xs text-muted-foreground mt-1"
            lang={languageFor(trend.label)}
            dir={directionFor(trend.label)}
          >
            <span className={trend.value >= 0 ? "text-secondary" : "text-destructive"}>
              {trend.value >= 0 ? "+" : ""}
              {trend.value}
            </span>{" "}
            {t(trend.label)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
