import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

export interface MultiSelectOption {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  lang?: string;
  dir?: "ltr" | "rtl";
  emptyLang?: string;
  emptyDir?: "ltr" | "rtl";
  searchLang?: string;
  searchDir?: "ltr" | "rtl";
  removeLabel?: (label: string) => string;
  removeLang?: string;
  removeDir?: "ltr" | "rtl";
  className?: string;
  disabled?: boolean;
  // Support additional HTML attributes like data-testid
  [key: string]: unknown;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  emptyMessage = "No items found.",
  searchPlaceholder = "Search...",
  lang,
  dir,
  emptyLang,
  emptyDir,
  searchLang,
  searchDir,
  removeLabel,
  removeLang,
  removeDir,
  className,
  disabled = false,
  ...rest
}: MultiSelectProps) {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const removeLabelId = React.useId();
  const placeholderText = lang ? placeholder : t(placeholder);
  const placeholderLang = lang ?? languageFor(placeholder);
  const placeholderDir = dir ?? directionFor(placeholder);
  const emptyText = emptyLang ? emptyMessage : t(emptyMessage);
  const resolvedEmptyLang = emptyLang ?? lang ?? languageFor(emptyMessage);
  const resolvedEmptyDir = emptyDir ?? dir ?? directionFor(emptyMessage);
  const searchText = searchLang ? searchPlaceholder : t(searchPlaceholder);
  const resolvedSearchLang = searchLang ?? lang ?? languageFor(searchPlaceholder);
  const resolvedSearchDir = searchDir ?? dir ?? directionFor(searchPlaceholder);
  const removeNameSource = "Remove {name}";
  const resolvedRemoveLabel =
    removeLabel ??
    ((label: string) => formatInterfaceMessage(removeNameSource, { name: label }, language));
  const resolvedRemoveLang =
    removeLang ?? (removeLabel ? (lang ?? "en") : languageFor(removeNameSource));
  const resolvedRemoveDir =
    removeDir ?? (removeLabel ? (dir ?? "ltr") : directionFor(removeNameSource));

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSearchValue("");
    setOpen(nextOpen);
  };

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleRemove = (value: string) => {
    onChange(selected.filter((item) => item !== value));
  };

  const selectedOptions = options.filter((option) => selected.includes(option.value));

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={true}>
      <PopoverTrigger asChild>
        <Button
          {...rest}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
          lang={placeholderLang}
          dir={placeholderDir}
        >
          <div className="flex gap-1 flex-wrap">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((option, index) => {
                const optionNameMarker = "__questarr_option_name__";
                const removeAccessibleNameTemplate = resolvedRemoveLabel(optionNameMarker);
                const optionNamePosition = removeAccessibleNameTemplate.indexOf(optionNameMarker);
                const actionBefore =
                  optionNamePosition < 0
                    ? removeAccessibleNameTemplate
                    : removeAccessibleNameTemplate.slice(0, optionNamePosition);
                const actionAfter =
                  optionNamePosition < 0
                    ? ""
                    : removeAccessibleNameTemplate.slice(
                        optionNamePosition + optionNameMarker.length
                      );
                const optionLabelId = `${removeLabelId}-option-${index}`;
                const actionBeforeId = `${removeLabelId}-before-${index}`;
                const actionAfterId = `${removeLabelId}-after-${index}`;
                const removeLabelledBy = [
                  actionBefore ? actionBeforeId : null,
                  optionLabelId,
                  actionAfter ? actionAfterId : null,
                ]
                  .filter((id): id is string => id !== null)
                  .join(" ");

                return (
                  <Badge variant="secondary" key={option.value} className="flex items-center">
                    <span id={optionLabelId} lang="und" dir="auto">
                      {option.label}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(option.value);
                      }}
                      aria-labelledby={removeLabelledBy}
                      className="ml-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {actionBefore ? (
                        <span
                          id={actionBeforeId}
                          className="sr-only"
                          lang={resolvedRemoveLang}
                          dir={resolvedRemoveDir}
                        >
                          {actionBefore}
                        </span>
                      ) : null}
                      {actionAfter ? (
                        <span
                          id={actionAfterId}
                          className="sr-only"
                          lang={resolvedRemoveLang}
                          dir={resolvedRemoveDir}
                        >
                          {actionAfter}
                        </span>
                      ) : null}
                      <X className="h-3 w-3 cursor-pointer" />
                    </button>
                  </Badge>
                );
              })
            ) : (
              <span className="text-muted-foreground" lang={placeholderLang} dir={placeholderDir}>
                {placeholderText}
              </span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        dir={dir ?? placeholderDir}
      >
        <Command dir={resolvedSearchDir}>
          <CommandInput
            placeholder={searchText}
            lang={searchValue ? "und" : resolvedSearchLang}
            dir={searchValue ? "auto" : resolvedSearchDir}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty lang={resolvedEmptyLang} dir={resolvedEmptyDir}>
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => handleToggle(option.value)}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
                    />
                    <span lang="und" dir="auto">
                      {option.label}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
