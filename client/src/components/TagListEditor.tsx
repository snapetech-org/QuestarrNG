import React, { useCallback, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

interface TagListEditorProps {
  /** Current tags. Comparison for duplicates is case-insensitive. */
  tags: string[];
  onChange: (tags: string[]) => void;
  inputId: string;
  label: string;
  placeholder: string;
  helperText: string;
  emptyText: string;
  addAriaLabel: string;
}

/**
 * Add/remove UI for a small list of free-text tags (release groups, blacklist terms, etc.):
 * an input with an Enter-to-add affordance, rendered as removable badges below it.
 */
export default function TagListEditor({
  tags,
  onChange,
  inputId,
  label,
  placeholder,
  helperText,
  emptyText,
  addAriaLabel,
}: Readonly<TagListEditorProps>) {
  const [inputValue, setInputValue] = useState("");
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const removeNameSource = "Remove {name}";

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setInputValue("");
      return;
    }
    onChange([...tags, trimmed]);
    setInputValue("");
  }, [inputValue, tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="text-sm font-medium">
        <span lang={languageFor(label)} dir={directionFor(label)}>
          {t(label)}
        </span>
      </Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t(placeholder)}
          lang={inputValue ? "und" : languageFor(placeholder)}
          dir={inputValue ? "auto" : directionFor(placeholder)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          aria-label={t(addAriaLabel)}
          lang={languageFor(addAriaLabel)}
          dir={directionFor(addAriaLabel)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <p
        className="text-xs text-muted-foreground"
        lang={languageFor(helperText)}
        dir={directionFor(helperText)}
      >
        {t(helperText)}
      </p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              <span lang="und" dir="auto">
                {tag}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(tag)}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                aria-label={formatInterfaceMessage(removeNameSource, { name: tag }, language)}
                lang={languageFor(removeNameSource)}
                dir={directionFor(removeNameSource)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {tags.length === 0 && (
        <p
          className="text-xs text-muted-foreground italic"
          lang={languageFor(emptyText)}
          dir={directionFor(emptyText)}
        >
          {t(emptyText)}
        </p>
      )}
    </div>
  );
}
