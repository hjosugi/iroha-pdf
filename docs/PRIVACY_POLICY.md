# Iroha PDF privacy policy

Effective date: 2026-07-12

Iroha PDF is a local-first PDF application published by the Iroha PDF project.
Questions and privacy requests can be sent privately through the repository's
GitHub Security Advisory contact mechanism. Do not include a private document
or credential in a public issue.

## Information handled by the app

PDFs, notes, annotations, file names, and recent-workspace state are stored on
your device. The project does not operate a server that receives this content.
The current app does not include advertising or analytics SDKs and does not
sell personal information.

If you choose Google Drive, the app sends the files and synchronization data
needed for that feature directly to Google. Google processes that data under
your Google account and Google's terms. Iroha PDF requests only `drive.file`
and `drive.appdata` access. Drive is optional and local features remain usable
without signing in.

## Permissions

File or photo access is used only after you choose content to open or convert.
Camera access, when enabled for scanning, is used to create a document you
requested. Network access is used for optional Google authentication and Drive
synchronization. The app does not use these permissions for advertising.

## Storage, security, and retention

Local data remains until you delete the relevant item or remove the app's data.
OAuth credentials must be stored in the platform Keychain/Keystore. Network
traffic to Google uses HTTPS. Exported and printed copies are controlled by the
destination you select and may remain outside Iroha PDF's private storage.

## Deletion and disconnection

To remove local data, delete the document/note where that action is available,
or remove Iroha PDF's app data through the operating system. To disconnect
Google Drive, sign out in Iroha PDF and revoke Iroha PDF under your Google
Account's third-party connections. Deleting local data does not automatically
delete a Drive file, and deleting a Drive file does not automatically delete an
exported local copy. Remove unwanted Drive files and app data from Google Drive
as a separate action.

Iroha PDF does not create a developer-operated user account, so there is no
separate Iroha PDF server account to delete.

## Changes

Material changes will be published in this repository and reflected by a new
effective date. Store disclosures must be rechecked against the exact binary
and bundled SDKs before each release.

