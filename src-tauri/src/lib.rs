use std::fs;
use std::path::Path;
use std::process::Command;
use serde_json;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_video: bool,
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Directory does not exist".to_string());
    }

    let mut entries = Vec::new();
    
    match fs::read_dir(dir_path) {
        Ok(dir_entries) => {
            for entry in dir_entries {
                match entry {
                    Ok(entry) => {
                        let entry_path = entry.path();
                        let name = entry_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        let full_path = entry_path.to_string_lossy().to_string();
                        let is_dir = entry_path.is_dir();
                        
                        let is_video = if !is_dir {
                            let extension = entry_path.extension()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_lowercase();
                            matches!(extension.as_str(), "mp4" | "avi" | "mkv" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "3gp")
                        } else {
                            false
                        };
                        
                        entries.push(DirEntry {
                            name,
                            path: full_path,
                            is_dir,
                            is_video,
                        });
                    }
                    Err(_) => continue,
                }
            }
        }
        Err(e) => return Err(format!("Failed to read directory: {}", e)),
    }

    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
fn scan_directory_recursive(path: String) -> Result<Vec<DirEntry>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Directory does not exist".to_string());
    }

    let mut entries = Vec::new();
    
    fn scan_directory_recursive_helper(dir_path: &Path, entries: &mut Vec<DirEntry>) -> Result<(), String> {
        match fs::read_dir(dir_path) {
            Ok(dir_entries) => {
                for entry in dir_entries {
                    match entry {
                        Ok(entry) => {
                            let entry_path = entry.path();
                            let name = entry_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                            let full_path = entry_path.to_string_lossy().to_string();
                            let is_dir = entry_path.is_dir();
                            
                            if is_dir {
                                if let Err(e) = scan_directory_recursive_helper(&entry_path, entries) {
                                    eprintln!("Warning: Failed to scan directory {}: {}", full_path, e);
                                }
                            } else {
                                let extension = entry_path.extension()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_lowercase();
                                let is_video = matches!(extension.as_str(), "mp4" | "avi" | "mkv" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "3gp" | "mpg" | "mpeg");
                                
                                entries.push(DirEntry {
                                    name,
                                    path: full_path,
                                    is_dir,
                                    is_video,
                                });
                            }
                        }
                        Err(e) => {
                            eprintln!("Warning: Failed to read directory entry: {}", e);
                            continue;
                        }
                    }
                }
            }
            Err(e) => return Err(format!("Failed to read directory: {}", e)),
        }
        Ok(())
    }

    scan_directory_recursive_helper(dir_path, &mut entries)?;

    entries.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));

    Ok(entries)
}

#[derive(serde::Serialize, serde::Deserialize)]
struct VideoMetadata {
    duration: f64,
    width: i32,
    height: i32,
    bitrate: Option<i64>,
    codec: Option<String>,
    file_size: u64,
}

#[tauri::command]
async fn extract_video_metadata(file_path: String) -> Result<VideoMetadata, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    let output = Command::new("ffprobe")
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &file_path
        ])
        .output();

    match output {
        Ok(output) => {
            if !output.status.success() {
                return Err(format!("FFprobe failed: {}", String::from_utf8_lossy(&output.stderr)));
            }

            let json_str = String::from_utf8_lossy(&output.stdout);
            let parsed: serde_json::Value = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse FFprobe output: {}", e))?;

            let streams = parsed["streams"].as_array()
                .ok_or("No streams found")?;

            let video_stream = streams.iter()
                .find(|s| s["codec_type"].as_str() == Some("video"))
                .ok_or("No video stream found")?;

            let duration = parsed["format"]["duration"].as_str()
                .and_then(|d| d.parse::<f64>().ok())
                .unwrap_or(0.0);

            let width = video_stream["width"].as_i64().unwrap_or(0) as i32;
            let height = video_stream["height"].as_i64().unwrap_or(0) as i32;
            let bitrate = parsed["format"]["bit_rate"].as_str()
                .and_then(|b| b.parse::<i64>().ok());
            let codec = video_stream["codec_name"].as_str().map(|s| s.to_string());

            let file_size = path.metadata()
                .map_err(|e| format!("Failed to get file size: {}", e))?
                .len();

            Ok(VideoMetadata {
                duration,
                width,
                height,
                bitrate,
                codec,
                file_size,
            })
        }
        Err(e) => Err(format!("Failed to execute ffprobe: {}", e)),
    }
}

#[tauri::command]
async fn generate_thumbnail(
    video_path: String, 
    output_path: String, 
    timestamp: Option<f64>
) -> Result<String, String> {
    let timestamp_str = timestamp.unwrap_or(10.0).to_string();
    
    if let Some(parent) = Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create thumbnail directory: {}", e))?;
    }

    let output = Command::new("ffmpeg")
        .args(&[
            "-i", &video_path,
            "-ss", &timestamp_str,
            "-vframes", "1",
            "-y",
            "-vf", "scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2",
            &output_path
        ])
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                Ok(output_path)
            } else {
                Err(format!("FFmpeg failed: {}", String::from_utf8_lossy(&output.stderr)))
            }
        }
        Err(e) => Err(format!("Failed to execute ffmpeg: {}", e)),
    }
}

#[tauri::command]
fn open_file_externally(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        match Command::new("cmd")
            .args(["/C", "start", "", &file_path])
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open file: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        match Command::new("open")
            .arg(&file_path)
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open file: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        match Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open file: {}", e)),
        }
    }
}

#[tauri::command]
fn open_file_with_dialog(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        match Command::new("explorer")
            .args(["/select,", &file_path])
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open file location: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        match Command::new("open")
            .args(["-R", &file_path])
            .spawn()
        {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to show file in Finder: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        if Command::new("nautilus")
            .args(["-s", &file_path])
            .spawn()
            .is_ok()
        {
            Ok(())
        } else if Command::new("dolphin")
            .args(["--select", &file_path])
            .spawn()
            .is_ok()
        {
            Ok(())
        } else {
            match Command::new("xdg-open")
                .arg(path.parent().unwrap_or(path))
                .spawn()
            {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Failed to open file manager: {}", e)),
            }
        }
    }
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn read_subtitle_file(path: String) -> Result<String, String> {
    match fs::read_to_string(&path) {
        Ok(content) => {
            Ok(content)
        }
        Err(e) => Err(format!("Failed to read subtitle file: {}", e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet, read_directory, scan_directory_recursive, extract_video_metadata, generate_thumbnail, open_file_externally, open_file_with_dialog, file_exists, read_subtitle_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
