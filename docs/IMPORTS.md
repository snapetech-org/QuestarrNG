# Download processing, RomM, and security scans

QuestarrNG can process completed downloads automatically or present them for
review before they enter a library. Open **Settings → Import** to configure the
pipeline. Its tabs cover **General Config**, **RomM**, **Path Mappings**, and
**Security & Scanning**.

For root-folder discovery, import history, and download recovery, see the
[Library Import guide](LIBRARY_IMPORT.md).

## Set up post-processing

1. In **General Config**, enable **Post-Processing** and choose the library
   root as QuestarrNG sees it (for example, `/data/games`).
2. Configure how files should be transferred and whether archives should be
   unpacked. You can also choose the rename pattern, platform eligibility,
   whether to sort detected DLC/updates/extras into subfolders, and whether to
   delete the source after a successful move or copy.
3. If a downloader uses a different host path from QuestarrNG, configure a
   **Path Mapping** so the server can resolve the completed download. The
   download and destination roots must be available to the QuestarrNG process.
4. Use the built-in hardlink check before selecting hardlinks. Hardlinks require
   compatible paths on the same filesystem; use copy or move when the source
   and library are on separate volumes.

For archive safety, QuestarrNG validates paths and links before extraction and
limits the default archive to 50,000 entries and 250 GiB of expanded data. Set
`ARCHIVE_MAX_ENTRIES` or `ARCHIVE_MAX_EXPANDED_BYTES` in the server environment
to change these limits. Archive work runs one at a time per process, with at
most 16 active or queued requests by default; configure
`ARCHIVE_MAX_PENDING_EXTRACTIONS` to change that queue limit. During extraction,
QuestarrNG monitors filesystem use, stops if it crosses the configured expanded
size limit or approaches the filesystem safety reserve, and measures staged
output before importing it. Each archive tool invocation has a 30-minute
timeout. The runtime disk guard is not an OS-level quota; unrelated writes to
the same filesystem can cause an early abort or consume space.

Downloads that need a destination choice, archive password, or other review
appear in the **Pending Imports** card on the Library page. Use **Review** to
inspect the proposed source and destination before confirming the import.

## Route ROM imports to RomM

QuestarrNG writes files into RomM's mounted library folders; it does not call
the RomM API. Mount the same storage into both services and make sure the
QuestarrNG process can read and write it.

1. Open **Settings → Import → RomM** and enable **Route ROM imports to RomM**.
2. Set **RomM ROM library root** to the path inside QuestarrNG's container or
   host process. The default shown by the app is `/data/romm/library/roms`.
3. Choose a folder layout:
   - **RomM platform slug** creates a platform folder from the configured
     RomM slug.
   - **Custom folder bindings** maps RomM slugs to relative folders under the
     library root using the JSON editor.
4. In **Platform slug mappings**, assign a RomM slug to each IGDB platform.
   Use **Load default platform mappings** when the list is empty. A blank slug
   leaves that platform's imports in the PC library.
5. Choose the transfer mode and how to handle an existing game. You can keep
   both files with a new name, skip, replace, or send the conflict for review.
   Single-file ROMs can go directly in the platform folder or in a game folder.
6. Save the settings. For a manual import, choose **RomM ROM library** in the
   review dialog when the option is available.

If a platform has no custom folder binding, select whether to fall back to its
RomM platform slug or require a binding. Folder bindings are relative to the
configured RomM library root, so they cannot select an arbitrary destination.

## Configure pre-import security scans

Both scanners are optional and disabled until configured. Open **Settings →
Import → Security & Scanning**. Save the settings before using **Test**; the
buttons test the saved configuration.

| Scanner        | What QuestarrNG sends                                                                                                                             | Configuration and behavior                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VirusTotal** | A SHA-256 hash over HTTPS. The file itself is not uploaded. For a directory download, QuestarrNG checks the largest file as the primary artifact. | Enter an API key and set the detection threshold. An import is blocked when the number of malicious detections is greater than the threshold. Unknown hashes are allowed by default; enable **Block Unknown Hashes** to block them. |
| **ClamAV**     | File contents streamed to the configured ClamAV daemon over its INSTREAM TCP protocol.                                                            | Enter the daemon host and port (default `3310`). ClamAV examines up to 10,000 files in a directory download, subject to directory-entry, depth, and time limits.                                                                    |

The VirusTotal API key is stored in QuestarrNG's database without encryption;
protect the database and its backups. ClamAV's INSTREAM connection is not
encrypted, so keep the daemon on a trusted network. See
[`SECRETS.md`](SECRETS.md) and [`THREAT_MODEL.md`](THREAT_MODEL.md) for the
security details.

An import proceeds automatically only after at least one enabled scanner returns
a complete clean verdict. With no scanner configured, when VirusTotal cannot
check a file in non-strict mode, or when ClamAV cannot examine every file, the
download is held for manual review. **Block Unknown Hashes** blocks unknown
VirusTotal results and lookup failures. After reviewing the reason in Pending
Imports, the user can confirm an incomplete scan. These checks are optional
defense in depth, not a guarantee that every file is safe.

## When a download is flagged

QuestarrNG moves a flagged download into a `.questarr-quarantine` directory
beside the selected library root, records its `quarantined` status, and creates
an in-app **Security Alert** when that notification is enabled. The item
appears in the Library page's **Pending Imports** card with the scanner reason.
A quarantined item has no **Review**
action, and the import endpoint rejects it even if a client tries to submit an
import plan directly.

The parent of the library root must be writable by QuestarrNG so it can create
the sibling quarantine directory. If `/data` is itself a read-only or
root-owned mount point, set the library root to a subdirectory such as
`/data/games` so quarantine can be created alongside it inside the writable
volume.

**Dismiss** clears the item from Pending Imports; it does not import, restore,
or delete the quarantined file, and it does not dismiss the separate
notification. Inspect or remove the file through the host filesystem according
to your own review process.

For a summary of all capabilities added by the fork, see
[`FORK_CHANGES.md`](FORK_CHANGES.md). For the complete version history, see
[`CHANGELOG.md`](CHANGELOG.md).
