# Privacy and security model

Iroha PDF is designed as a local-first application. PDF content, annotations, and notes stay on the device unless the user explicitly imports from, exports to, or enables synchronization with a provider.

## Data flow

- Imported PDFs are copied into the app's private document directory. The original is never overwritten by the starter implementation.
- Annotations and notes are stored in local SQLite on mobile. Desktop linked notes currently use local application storage.
- Export and print create a new flattened PDF copy in a temporary/output location.
- Basic PDF tools run on-device and do not upload documents to an Iroha PDF service.
- Google Drive support uses user-owned storage. The client requests `drive.file` and `drive.appdata`, not unrestricted access to all Drive files.

## Credentials and secrets

- OAuth tokens must be stored only in platform secure storage or an OS credential vault.
- Client secrets, signing keys, keystores, provisioning profiles, and production environment files must never be committed.
- Desktop OAuth must use the system browser with PKCE. Embedded WebView sign-in is not permitted.

## Temporary files and deletion

- Output files are created separately so destructive in-place edits are avoided.
- Production builds must define cleanup windows for cache, failed uploads, print copies, and decrypted temporary files.
- Removing a local record and deleting a cloud file are separate user actions; the UI must state which copy is affected.

## Untrusted PDFs

PDFs are untrusted input. Production releases must keep PDFium, `pdf-lib`, and native processors patched; disable PDF JavaScript; confirm external links; apply memory and time limits; and isolate native sidecars. Passwords and document content must not be written to logs or crash reports.

## Diagnostics

Diagnostics are off by default. Any future opt-in diagnostics must exclude document bytes, extracted text, annotations, notes, file paths, titles, OAuth tokens, and stable cross-service identifiers. Users must be able to preview, export, and delete diagnostic data.

## Known release limitations

The v0.1.0 source release is an engineering preview. Native app signing, store privacy forms, OAuth verification, malicious fixture testing, security sandboxing, and real-device evidence remain tracked in GitHub Issues. It should not be represented as a hardened production release.

Security reports should be submitted privately through GitHub's security advisory feature once enabled. Do not open a public issue containing credentials, private documents, or exploitable sample files.
