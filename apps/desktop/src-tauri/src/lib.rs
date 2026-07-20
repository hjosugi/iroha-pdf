/// Grants the filesystem scope that the file dialog would normally grant.
///
/// The dialog hands picked paths to `FsExt::allow_file`, so nothing is readable until
/// the user chooses it. That is the right behaviour, but it also means an automated
/// test cannot reach a file: the dialog is a native Wayland/portal window that no
/// scripting tool available here can drive. This opens the same door directly.
///
/// Deliberately narrow: debug builds only, and only for a directory named explicitly
/// through `IROHA_E2E_SCOPE`. Release builds do not contain this function at all.
#[cfg(debug_assertions)]
fn allow_e2e_scope(app: &tauri::App) {
    use tauri_plugin_fs::FsExt;

    let Ok(directory) = std::env::var("IROHA_E2E_SCOPE") else {
        return;
    };
    match app.fs_scope().allow_directory(&directory, true) {
        Ok(()) => eprintln!("iroha-pdf: e2e scope granted for {directory}"),
        Err(error) => eprintln!("iroha-pdf: could not grant e2e scope: {error}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            allow_e2e_scope(_app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Iroha PDF");
}
