import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type IconComponent } from "@/types/components";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

interface EmptyStateProps {
  icon: IconComponent;
  title: string;
  description: string;
  titleValues?: Record<string, string | number>;
  descriptionValues?: Record<string, string | number>;
  actionLabel?: string;
  actionLink?: string;
  onAction?: () => void;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  titleValues,
  descriptionValues,
  actionLabel,
  actionLink,
  onAction,
  className,
}: EmptyStateProps) {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const translatedTitle = titleValues
    ? formatInterfaceMessage(title, titleValues, language)
    : t(title);
  const translatedDescription = descriptionValues
    ? formatInterfaceMessage(description, descriptionValues, language)
    : t(description);
  return (
    <div
      className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}
      data-testid="empty-state"
    >
      <div className="bg-muted/50 p-6 rounded-full mb-6 ring-1 ring-border">
        <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3
        className="text-xl font-semibold mb-2 tracking-tight"
        lang={languageFor(title)}
        dir={directionFor(title)}
      >
        {translatedTitle}
      </h3>
      <p
        className="text-muted-foreground max-w-sm mb-8 text-sm"
        lang={languageFor(description)}
        dir={directionFor(description)}
      >
        {translatedDescription}
      </p>
      {actionLabel && actionLink && (
        <Button size="lg" className="font-semibold" asChild>
          <Link href={actionLink} lang={languageFor(actionLabel)} dir={directionFor(actionLabel)}>
            {t(actionLabel)}
          </Link>
        </Button>
      )}
      {actionLabel && onAction && (
        <Button size="lg" className="font-semibold" onClick={onAction}>
          <span lang={languageFor(actionLabel)} dir={directionFor(actionLabel)}>
            {t(actionLabel)}
          </span>
        </Button>
      )}
    </div>
  );
}
