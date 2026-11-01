# QuestarrNG PR #155 source-review follow-up

Reviewed source head: `e04cf58c8569ba335da82e2ce2226f1fb2bbf205`. The independent review found two localization defects:

1. `shared/service-messages.ts` and the legacy notification formatter wrapped dynamic placeholders in FSI/PDI only for Arabic. Translated service and notification templates can combine RTL names, paths, or provider errors with text and punctuation in any target locale.
2. `client/src/hooks/use-toast.ts` translated string titles and descriptions when a toast was created. A toast still open during a locale switch therefore kept its old language.

Commit `a44dc03c141ed2c8843264ee8ba1977d99c7fc76` addresses both:

- A shared `isolateBidirectionalValue` helper wraps each nonempty interpolated value in FSI/PDI without changing the value. Localized service messages and legacy outbound notification templates now apply it across the target locales, including formatted counts and the translated `unknown error` placeholder.
- Toast state retains the original string. `client/src/components/ui/toaster.tsx` translates string titles and descriptions with the active locale at render time; non-string React content is unchanged.

## Verification and limits

`git diff --check` passed for the follow-up source changes. No tests, builds, scans, CI jobs, or browser sessions were run at this head. The existing headed-browser evidence remains pinned to earlier source heads and does not verify this follow-up. No qualified native-speaker signoff is established.
