# QuestarrNG RTL carousel keyboard follow-up

PR #155 was reattested OPEN and ready for review before this change at head
`7c185e41a7b808ba2bcdde853e0d8c103f97f6a8`, tree
`7bec0e52b6f763a76f678244149aaf0f09f7e05b`, based on `main` at
`e188cd0c74c73071c94b04915e1babac2d2bf386`.

Product commit `d2f6f4173779273a5b9656957aefe0d88edb235a` has tree
`ab221b69f208e742c3d4a8ac9b94fceead004665` and directly follows the pinned
input head. It changes only `client/src/components/ui/carousel.tsx`.

The earlier RTL follow-up set Embla's `direction` from the active interface
locale. Static review found that the shared carousel key handler still mapped
physical left/right arrows as LTR. This change maps ArrowRight to logical
previous and ArrowLeft to logical next when a horizontal carousel explicitly
uses RTL. LTR, default direction, and vertical mappings stay unchanged. The
only production caller is `GameCarouselSection`, which passes the same locale
direction used for the document `dir` attribute. The locked Embla version is
8.6.0.

An independent static review at the pinned input head confirmed the RTL
mapping and the unchanged LTR/default/vertical behavior. `git diff --check`
passed. No tests, builds, scans, or CI were run. The exact product head had
zero check runs and zero deployments at review; no browser acceptance is
claimed.

Reference documentation:

- [Embla v8 options](https://www.embla-carousel.com/docs/v8/api/options)
  documents the `direction` option, its `ltr` default, RTL content direction,
  and reactive options in framework wrappers.
- [Embla v8 methods](https://www.embla-carousel.com/docs/v8/api/methods)
  defines `scrollPrev` and `scrollNext` as previous and next snap navigation.

`change.diff` contains the exact product patch; `SHA256SUMS.txt` verifies this
packet.
