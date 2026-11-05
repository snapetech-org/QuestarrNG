# QuestarrNG setup browser review at PR head 6f592afa

Reviewed PR #155 at commit 6f592afae749d2ad9fa82a9807f7e992ead81e10 (tree b0005d82aa1a6470adc6472d6946b3cef5cef7b1) in a headed Chrome session on the dedicated Agentic VM. The page was /setup. The screenshots are 1920×1024. The twelve PNGs and their SHA-256 manifest are in setup-pr-head-6f592/.

## Coverage

The setup screen was opened in each direct locale: es, zh-Hans, hi, de, ja, fr, pt-BR, ar, ko, zh-Hant, vi, and id. The captured view includes the migration notice, initial setup heading, locale selector, username and password fields, password helper, and the beginning of IGDB configuration.

## Isolation

The preview used a disposable empty SQLite database. No account was created and no credentials were entered. The IGDB fields remained blank.

## Visual findings

- Across the twelve captured locales, the visible setup copy is localized and legible. The form stays within the viewport width, with no visible overlap or horizontal clipping. The page scrolls vertically for fields below the captured fold.
- Arabic uses right-aligned, right-to-left form content in the visible setup area; no horizontal clipping or overlap is visible.
- In Japanese, the password requirement helper wraps its final い。 onto a second line by itself. This is a visual copy-length candidate for review; the screenshot accurately records the current value at this PR head.
- These captures cover one desktop viewport and the setup route. They do not establish mobile behavior, the remaining application screens, external integrations, or native-speaker approval.

## Evidence integrity

Verify from this directory with: sha256sum -c SHA256SUMS
