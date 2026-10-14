import React, { useState, useEffect } from "react";
import { Ban } from "lucide-react";
import TagListSettingsCard from "@/components/TagListSettingsCard";

interface ReleaseNameBlacklistSettingsProps {
  blacklistTerms: string[];
  onTermsChange: (terms: string[]) => void;
}

/** Settings card for the global list of terms that hide matching release names everywhere. */
export default function ReleaseNameBlacklistSettings({
  blacklistTerms,
  onTermsChange,
}: Readonly<ReleaseNameBlacklistSettingsProps>) {
  const [terms, setTerms] = useState<string[]>(blacklistTerms);

  useEffect(() => {
    setTerms(blacklistTerms);
  }, [blacklistTerms]);

  useEffect(() => {
    onTermsChange(terms);
  }, [terms, onTermsChange]);

  return (
    <TagListSettingsCard
      icon={Ban}
      title="Release Name Blacklist"
      description="Hide releases whose name contains any of these terms, across manual search, auto-search and AI-assisted results. Matching is case-insensitive and checks for the term anywhere in the release name."
      tags={terms}
      onTagsChange={setTerms}
      editor={{
        inputId: "blacklist-term-input",
        label: "Blacklisted Terms",
        placeholder: "e.g. HYPERVISOR, CAM, SAMPLE...",
        helperText: "Press Enter or click + to add a term. Comparison is case-insensitive.",
        emptyText: "No blacklisted terms configured. All release names will be considered.",
        addAriaLabel: "Add blacklisted term",
      }}
      buildPayload={() => ({ releaseNameBlacklist: JSON.stringify(terms) })}
      successTitle="Release Name Blacklist Saved"
      successDescription="Your blacklisted release name terms have been saved."
      saveLabel="Save Blacklist"
      onReset={() => setTerms([])}
      data-i18n-title={"Release Name Blacklist"}
    />
  );
}
