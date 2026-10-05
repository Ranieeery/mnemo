use std::error::Error;
use std::path::Path;

/// Tauri needs Common Controls v6 on Windows. `tauri-build` embeds that manifest only in the app binary, so test
/// binaries would crash on start (`STATUS_ENTRYPOINT_NOT_FOUND`). Embedding the same manifest through the linker
/// covers every target of the package instead.
const WINDOWS_MANIFEST: &str = "windows-app-manifest.xml";

fn main() -> Result<(), Box<dyn Error>> {
    let embeds_own_manifest = std::env::var("CARGO_CFG_TARGET_ENV").is_ok_and(|env| env == "msvc");
    let windows = if embeds_own_manifest {
        tauri_build::WindowsAttributes::new_without_app_manifest()
    } else {
        tauri_build::WindowsAttributes::new()
    };
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))?;

    if embeds_own_manifest {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join(WINDOWS_MANIFEST);
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
    Ok(())
}
