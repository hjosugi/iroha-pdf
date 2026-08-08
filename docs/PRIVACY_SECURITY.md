# Privacy and security model

Iroha PDF is designed as a local-first application. PDF content, annotations, and notes stay on the device unless the user explicitly imports from, exports to, or enables synchronization with a provider.

## Data flow

- Mobile imports copy PDFs into the app's private document directory and do not
  overwrite the provider original. Desktop writes back to the selected path only
  when the user explicitly chooses Save; Save As and mobile export create a new copy.
- Annotations and notes are stored in local SQLite on mobile. Desktop linked notes currently use local application storage.
- Export and print create a new flattened PDF copy in a temporary/output location.
- Basic PDF tools run on-device and do not upload documents to an Iroha PDF service.
- The current Google Drive mobile flow lists app-visible files and downloads the
  PDF the user selects. It requests `drive.file` and `drive.appdata`, not unrestricted
  access to all Drive files, but the current UI does not upload or synchronize app data.

Iroha PDF has no developer-operated content service. In the current Drive flow,
file-list metadata and the selected downloaded PDF travel directly between the app
and Google over HTTPS. Synchronization metadata would do so only after the planned
sync flow is implemented and enabled. Local-only use does not transmit document
content off-device.

## Data inventory and retention

| Data | Location | Retention | User control |
|---|---|---|---|
| Imported PDF copies | App-private files | Until the user deletes the local copy or app | Import, export, delete app data |
| Notes and annotations | Mobile SQLite / desktop local storage | Notes remain until deleted; mobile annotations are removed with their local PDF record | Edit or delete locally |
| Recovery journal | Mobile SQLite | Applied records may be pruned; unresolved copies remain until reviewed | Review/delete recovery copies |
| OAuth tokens | Keychain/Keystore or OS credential vault | Until sign-out, revocation, or app removal | Sign out and revoke access |
| Drive PDFs | User's Google Drive | Controlled by the user's Drive retention | Delete from Drive explicitly |
| Planned Drive sync metadata | Drive `appDataFolder` | Not written by the current UI; future data remains until removed | Disconnect and remove app data |
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

PDFs are untrusted input. Production releases must keep PDFium, `pdf-lib`, and native processors patched; confirm external links; apply memory and time limits; and isolate native sidecars. Passwords and document content must not be written to logs or crash reports.

### Document JavaScript

A PDF can carry scripts. This one cannot run them, and the reason is worth writing down
rather than repeating as an assumption — an earlier version of this document simply
asserted "JavaScript disabled", which nothing here configures.

The bundled `@embedpdf/pdfium` wasm exports PDFium's API for *reading* a document's
scripts — `FPDFDoc_GetJavaScriptAction`, `FPDFJavaScriptAction_GetScript` and
neighbours — which is present in every PDFium build. What a build with `pdf_enable_v8`
also carries is the runtime: the `fxjs` layer, the `CJS_*` and `IJS_*` classes, and the
Acrobat built-ins it registers by name — `AFNumber_Format`, `AFSimple_Calculate`,
`util.printf`, `app.alert`, `event.value`. **None of those strings appears in the
shipped wasm.** There is an interface for looking at a script and no interpreter behind
it.

The second half is the application's own: nothing in either app calls
`getDocumentJavaScriptActions`, and neither uses `eval` or `new Function` on anything
from a document. So a script in a PDF is never read, never passed anywhere, and could
not be executed if it were.

Recheck this when the engine is upgraded. A future `@embedpdf/pdfium` built with V8
would change the answer silently, and the same string search settles it in a minute.

## Threat model

### Assets and trust boundaries

- Assets: PDF content, notes, annotations, OAuth tokens, Drive revision IDs,
  signing material, and recovery copies.
- Boundaries: OS document provider → app-private storage; untrusted PDF →
  PDFium/`pdf-lib`; app → Google OAuth/Drive; desktop UI → optional native
  sidecar; app → print/share destination.

### Threats and required controls

The two right-hand columns used to be one, headed "Controls / release requirement",
which let a control that exists and a control that is merely intended sit side by side
in the same cell. A security document that reads as though a mitigation is in place
when it is not is worse than one that admits the gap, so they are separated here. Only
things that can be pointed at in the source and are exercised by a test are in the
first column.

| Threat | Impact | In place | Required before a hardened release |
|---|---|---|---|
| Malformed or decompression-bomb PDF | crash, OOM, native-code exploit | mobile refuses flatten/print over 64 MiB before allocating in JS memory; malicious-fixture suite (encrypted refused visibly, broken cross-reference repaired, AcroForm preserved through a round trip); vendored engine patches verified in CI | byte budget on rendered pages — `BoundedLruCache` exists with tests but has no caller, so it bounds nothing today (#52, #18); a processing timeout, which does not exist; sandboxing (#57) |
| PDF JavaScript or external link | unexpected execution or exfiltration | the bundled pdfium has no JavaScript engine — see below — and nothing in either application reads or runs a document's scripts | make external navigation an explicit user action |
| Path traversal / unsafe output name | overwrite or disclose local files | mobile writes only into app-private directories; desktop output names come from the dialog, and the two names a save derives are validated in Rust against the picked path before the scope is widened | never trusting a file name embedded in a document, which nothing reads yet |
| OAuth token disclosure | Drive account access | scopes limited to `drive.file` and `drive.appdata`; no connect action offered when no client ID is configured | secure storage, PKCE/system browser (#32), token and log redaction, revoke on disconnect — none exercised, because nothing has talked to Google yet (#31) |
| Silent Drive conflict overwrite | user data loss | — | revision precondition, durable queue, conflict copy, explicit resolution. `DurableSyncQueue` exists with tests and no caller; upload is not wired to any screen; the resolution UI is #39. |
| Process kill, disk-full, or DB lock during autosave | note/annotation loss | WAL; write-ahead recovery journal reconciled at launch; transactional row write; recovery copies surfaced, and an honest message when one could not be kept. Desktop saves atomically — bytes assembled beside the document and renamed over it — so an interrupted save cannot truncate it. All three failures are injected in tests. | the same three injected on real hardware (#51) |
| Native sidecar compromise | host file access | no sidecar exists | everything in this row, if #25 lands |
| Sensitive diagnostics | private content disclosure | no diagnostics are collected or transmitted | the prohibitions themselves, once #66 adds anything |
| Stolen unlocked device | local content disclosure | OS app sandbox and device protection | document-level encryption, which is not provided |

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

The current v0.4.0 line and the changes listed as `Unreleased` are engineering
previews. Encrypted, malformed-but-repairable, AcroForm and large synthetic
fixtures are exercised where their independent tooling is
available, but that is not a security sandbox. Native app signing, submitted store
privacy forms, production OAuth verification, PDF-engine isolation and physical-device
evidence remain tracked in GitHub Issues. It must not be represented as a hardened
production release.

Security reports should be submitted privately through GitHub's security advisory feature once enabled. Do not open a public issue containing credentials, private documents, or exploitable sample files.
