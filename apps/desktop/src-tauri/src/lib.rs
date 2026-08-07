/// Grants the filesystem scope that the file dialog would normally grant.
///
/// The dialog hands picked paths to `FsExt::allow_file`, so nothing is readable until
/// the user chooses it. That is the right behaviour, but it also means an automated
/// test cannot reach a file: the dialog is a native Wayland/portal window that no
/// scripting tool available here can drive. This opens the same door directly.
///
/// `IROHA_E2E_SCOPE_FILE` grants exactly one file, which is what the dialog itself
/// does — a save then reaches the copies it writes beside the document only through
/// `allow_derived_file`, so a run under this variable is the real thing. The older
/// `IROHA_E2E_SCOPE` grants a whole directory and is kept for harnesses that need to
/// reach fixtures the app never opened.
///
/// Deliberately narrow: debug builds only, and only for what those variables name.
/// Release builds do not contain this function at all.
#[cfg(debug_assertions)]
fn allow_e2e_scope(app: &tauri::App) {
    use tauri_plugin_fs::FsExt;

    if let Ok(file) = std::env::var("IROHA_E2E_SCOPE_FILE") {
        match app.fs_scope().allow_file(&file) {
            Ok(()) => eprintln!("iroha-pdf: e2e scope granted for the file {file}"),
            Err(error) => eprintln!("iroha-pdf: could not grant e2e file scope: {error}"),
        }
    }
    let Ok(directory) = std::env::var("IROHA_E2E_SCOPE") else {
        return;
    };
    match app.fs_scope().allow_directory(&directory, true) {
        Ok(()) => eprintln!("iroha-pdf: e2e scope granted for {directory}"),
        Err(error) => eprintln!("iroha-pdf: could not grant e2e scope: {error}"),
    }
}

/// Extends the filesystem scope to a file that a save derives from one already in it.
///
/// Saving does not only write the document. It takes a pristine copy aside before the
/// first overwrite, and it assembles the new bytes in a partial file so that a crash or
/// a full disk cannot leave a fragment where the document was. Neither of those names
/// ever comes back from a dialog, and the dialog grants exactly the path it returned —
/// so without this they are forbidden paths and an in-place save fails before it has
/// written anything.
///
/// The grant is kept as narrow as the derivation it exists for: the source has to be in
/// scope already, which only the user picking it can arrange, and the derived file has
/// to sit beside it under a name that starts with its own.
#[tauri::command]
fn allow_derived_file(app: tauri::AppHandle, source: String, derived: String) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;

    let source = std::path::PathBuf::from(source);
    let derived = std::path::PathBuf::from(derived);
    let scope = app.fs_scope();

    if !scope.is_allowed(&source) {
        return Err(format!("not allowed: {} is not in scope", source.display()));
    }
    if source.parent() != derived.parent() {
        return Err("not allowed: a derived file has to sit beside its source".into());
    }
    let (Some(stem), Some(name)) = (
        source.file_stem().and_then(|part| part.to_str()),
        derived.file_name().and_then(|part| part.to_str()),
    ) else {
        return Err("not allowed: both paths need a file name".into());
    };
    if !name.starts_with(stem) || !name.to_ascii_lowercase().ends_with(".pdf") {
        return Err("not allowed: a derived file has to be a PDF named after its source".into());
    }

    scope.allow_file(&derived).map_err(|error| error.to_string())
}

/// The suffix a save assembles its bytes under, spelled out here rather than taken from
/// the caller: this is the one path the command below deletes, and what it can delete
/// must not depend on what the webview asks for. `partPathFor` in `file-bridge.ts`
/// builds the same name, and `discards only the partial file` in the real-runtime suite
/// fails if the two ever drift.
const PART_SUFFIX: &str = ".iroha-part.pdf";

/// Removes the partial file left behind when a save could not finish.
///
/// `fs:allow-remove` is deliberately not granted — nothing the webview does should be
/// able to delete a file — so the app cannot clear its own debris through the plugin.
/// This does it instead, for exactly one path per document: the partial beside a file
/// already in scope. The pristine copy is not reachable through it, and neither is the
/// document.
///
/// Returns whether there was anything to remove. A failure is the caller's to report,
/// not to retry: the document is intact either way, and what is left is a file the user
/// can see and delete.
#[tauri::command]
fn discard_part_file(app: tauri::AppHandle, source: String) -> Result<bool, String> {
    use tauri_plugin_fs::FsExt;

    let source = std::path::PathBuf::from(source);
    if !app.fs_scope().is_allowed(&source) {
        return Err(format!("not allowed: {} is not in scope", source.display()));
    }
    let (Some(parent), Some(stem)) = (
        source.parent(),
        source.file_stem().and_then(|part| part.to_str()),
    ) else {
        return Err("not allowed: the source needs a directory and a file name".into());
    };

    let part = parent.join(format!("{stem}{PART_SUFFIX}"));
    if !part.exists() {
        return Ok(false);
    }
    std::fs::remove_file(&part)
        .map(|()| true)
        .map_err(|error| format!("could not remove {}: {error}", part.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![allow_derived_file, discard_part_file])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            allow_e2e_scope(_app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Iroha PDF");
}
