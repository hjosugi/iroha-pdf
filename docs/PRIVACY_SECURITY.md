# Privacy and security model

Iroha PDF is designed as a local-first application. PDF content, annotations, and notes stay on the device unless the user explicitly imports from, exports to, or enables synchronization with a provider.

## Data flow

- Imported PDFs are copied into the app's private document directory. The original is never overwritten by the starter implementation.
- Annotations and notes are stored in local SQLite on mobile. Desktop linked notes currently use local application storage.
- Export and print create a new flattened PDF copy in a temporary/output location.
- Basic PDF tools run on-device and do not upload documents to an Iroha PDF service.
- Google Drive support uses user-owned storage. The client requests `drive.file` and `drive.appdata`, not unrestricted access to all Drive files.

Iroha PDF has no developer-operated content service. When Drive is enabled,
document bytes and synchronization metadata travel directly between the app and
Google over HTTPS. Local-only use does not transmit document content off-device.

## Data inventory and retention

| Data | Location | Retention | User control |
|---|---|---|---|
| Imported PDF copies | App-private files | Until the user deletes the local copy or app | Import, export, delete app data |
| Notes and annotations | Mobile SQLite / desktop local storage | Until the linked content or app data is deleted | Edit or delete locally |
| Recovery journal | Mobile SQLite | Applied records may be pruned; unresolved copies remain until reviewed | Review/delete recovery copies |
| OAuth tokens | Keychain/Keystore or OS credential vault | Until sign-out, revocation, or app removal | Sign out and revoke access |
| Drive PDFs | User's Google Drive | Controlled by the user's Drive retention | Delete from Drive explicitly |
| Drive sync metadata | Drive `appDataFolder` | Until access/data is removed | Disconnect and remove app data |
| Export/print copies | User-selected output or temporary directory | Platform/user controlled; temporary copies should be cleaned after use | Delete from Files/OS storage |

No advertising ID, precise location, contacts, browsing history, analytics, or
developer-operated account identifier is used by the current build.

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

## Threat model

### Assets and trust boundaries

- Assets: PDF content, notes, annotations, OAuth tokens, Drive revision IDs,
  signing material, and recovery copies.
- Boundaries: OS document provider → app-private storage; untrusted PDF →
  PDFium/`pdf-lib`; app → Google OAuth/Drive; desktop UI → optional native
  sidecar; app → print/share destination.

### Threats and required controls

| Threat | Impact | Controls / release requirement |
|---|---|---|
| Malformed or decompression-bomb PDF | crash, OOM, native-code exploit | byte-budgeted LRU, page-at-a-time rendering, patched engines, malicious fixtures, processing timeout |
| PDF JavaScript or external link | unexpected execution or exfiltration | JavaScript disabled; external navigation requires an explicit user action |
| Path traversal / unsafe output name | overwrite or disclose local files | app-private directories, generated output names, never trust embedded file names |
| OAuth token disclosure | Drive account access | secure storage, PKCE/system browser, token/log redaction, revoke on disconnect |
| Silent Drive conflict overwrite | user data loss | revision precondition, durable queue, conflict copy, explicit resolution |
| Process kill, disk-full, or DB lock during autosave | note/annotation loss | WAL, write-ahead recovery journal, transactional row write, surfaced recovery copy |
| Native sidecar compromise | host file access | no shell interpolation, allowlisted arguments, resource limits, OS sandbox, signed binary |
| Sensitive diagnostics | private content disclosure | diagnostics off by default and content/path/token fields prohibited |
| Stolen unlocked device | local content disclosure | OS app sandbox and device protection; document-level encryption is not yet provided |

Residual risks that block a hardened release are tracked in the security,
sandbox, performance, and full-device release-gate issues.

## Logging rules

Production logs may contain operation names, coarse timing, byte counts, HTTP
status classes, and synthetic error codes. They must never contain document
bytes/text, note or annotation bodies, local paths or file titles, OAuth
headers/tokens, Drive response bodies, or stable cross-service identifiers.

## Diagnostics

Diagnostics are off by default. Any future opt-in diagnostics must exclude document bytes, extracted text, annotations, notes, file paths, titles, OAuth tokens, and stable cross-service identifiers. Users must be able to preview, export, and delete diagnostic data.

## Known release limitations

The v0.1.0 source release is an engineering preview. Native app signing, store privacy forms, OAuth verification, malicious fixture testing, security sandboxing, and real-device evidence remain tracked in GitHub Issues. It should not be represented as a hardened production release.

Security reports should be submitted privately through GitHub's security advisory feature once enabled. Do not open a public issue containing credentials, private documents, or exploitable sample files.
