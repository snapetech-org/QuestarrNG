Questarr Windows Installer
==========================

The installer requires administrator rights. It installs Questarr to Program
Files, creates a Windows service named Questarr, starts it automatically, and
adds an inbound Windows Firewall rule for the bundled Questarr Node runtime.
During upgrades, setup stops the existing Questarr service and any remaining
Questarr processes running from the install directory before replacing files.

After installation, open http://localhost:5000 in your browser.

The installer bundles a self-contained .NET 11 Windows Service host; a
separate .NET runtime installation is not required.

Runtime data is stored in C:\ProgramData\Questarr (the install directory's
"data" folder is an NTFS junction into this location, so Questarr's own
config lookup finds it there automatically - the same way the Docker image
bind-mounts a "data" folder):

- data\sqlite.db: SQLite database
- data\config.yaml: app configuration (e.g. SSL settings)
- logs\questarr.log: service process output
- config.env: optional service environment overrides, such as PORT=5001

Uninstalling removes the Windows service, the firewall rule, and the
install-directory data junction. Runtime data in C:\ProgramData\Questarr
itself is preserved so accidental uninstalls (or a clean reinstall) do not
delete the database or configuration.

No in-app auto-updater
-----------------------
This installer does not include an in-app update checker or self-updater.
To upgrade, download the newer QuestarrSetup-*.exe and run it - the installer
detects the existing install, stops the service, replaces changed files, and
restarts it, preserving your ProgramData. There is currently no "Check for
updates" button inside Questarr itself; watch the GitHub Releases page
(https://github.com/snapetech-org/QuestarrNG/releases) or the repository for new
versions.

Building the installer
-----------------------
Every valid vMAJOR.MINOR.PATCH release tag builds this installer automatically.
The versioned release is published only after the Windows x64 installer and
Helm chart, with their SHA-256 checksums, are attached and verified.

To recover assets for an already-published release, run the Build Windows and
Helm assets workflow from the main branch and enter the published release tag.
The workflow validates that the tag matches package.json and points to main
before building; it then replaces the installer and checksum on that release
and refreshes the download links.

The optional Deploy Web App workflow can still build a Windows installer
artifact for dev/test evaluation. That manual build does not publish a
production release.
