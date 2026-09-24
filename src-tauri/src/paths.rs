// Where the app keeps its data. Normally the platform app-data dir
// (~/Library/Application Support/com.ala.za3tar on a Mac). ZA3TAR_DATA_DIR
// overrides it, which is how you run a second, empty copy — to go through
// setup again, or demo the app — without touching your real workspaces.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("ZA3TAR_DATA_DIR") {
        let p = PathBuf::from(dir);
        if !p.as_os_str().is_empty() {
            std::fs::create_dir_all(&p).map_err(|e| format!("ZA3TAR_DATA_DIR: {e}"))?;
            return Ok(p);
        }
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}
