import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Users } from "lucide-react";
import TagListSettingsCard from "@/components/TagListSettingsCard";
import { InterfaceText } from "@/components/InterfaceText";

interface PreferredReleaseGroupsSettingsProps {
  preferredGroups: string[];
  filterByPreferredGroups: boolean;
  onGroupsChange: (groups: string[]) => void;
  onFilterChange: (enabled: boolean) => void;
}

/** Settings card for preferred release groups and the related pre-filter switch. */
export default function PreferredReleaseGroupsSettings({
  preferredGroups,
  filterByPreferredGroups,
  onGroupsChange,
  onFilterChange,
}: Readonly<PreferredReleaseGroupsSettingsProps>) {
  const [groups, setGroups] = useState<string[]>(preferredGroups);
  const [filterEnabled, setFilterEnabled] = useState(filterByPreferredGroups);

  useEffect(() => {
    setGroups(preferredGroups);
    setFilterEnabled(filterByPreferredGroups);
  }, [preferredGroups, filterByPreferredGroups]);

  useEffect(() => {
    onGroupsChange(groups);
  }, [groups, onGroupsChange]);

  useEffect(() => {
    onFilterChange(filterEnabled);
  }, [filterEnabled, onFilterChange]);

  return (
    <TagListSettingsCard
      icon={Users}
      title="Preferred Release Groups"
      description="Prioritize releases from specific groups during auto-download. When matches are found, only those releases will be considered."
      tags={groups}
      onTagsChange={setGroups}
      editor={{
        inputId: "preferred-group-input",
        label: "Release Group Names",
        placeholder: "e.g. CODEX, SKIDROW, EMPRESS...",
        helperText: "Press Enter or click + to add a group. Comparison is case-insensitive.",
        emptyText: "No preferred groups configured. All groups will be considered equally.",
        addAriaLabel: "Add preferred release group",
      }}
      buildPayload={() => ({
        preferredReleaseGroups: JSON.stringify(groups),
        filterByPreferredGroups: filterEnabled,
      })}
      successTitle="Release Groups Saved"
      successDescription="Your preferred release group settings have been saved."
      saveLabel="Save Groups"
      onReset={() => {
        setGroups([]);
        setFilterEnabled(false);
      }}
      data-i18n-title={"Preferred Release Groups"}
    >
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="space-y-0.5">
          <Label htmlFor="filter-by-groups" className="text-sm font-medium">
            <InterfaceText source={"Pre-filter Download Search"} />
          </Label>
          <p className="text-xs text-muted-foreground">
            <InterfaceText
              source={
                "Automatically filter the download dialog to show only preferred groups, and only send availability/update notifications when a preferred group release is found"
              }
            />
          </p>
        </div>
        <Switch
          id="filter-by-groups"
          checked={filterEnabled}
          onCheckedChange={setFilterEnabled}
          disabled={groups.length === 0}
        />
      </div>
    </TagListSettingsCard>
  );
}
