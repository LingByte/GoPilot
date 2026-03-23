// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, State, Window};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader};
use std::cmp::min;
use std::io::Write;
use std::sync::{Arc, Mutex};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use std::thread;
use std::collections::HashMap;
use chrono::DateTime;
use tauri_plugin_single_instance;
use tokio::sync::Mutex as TokioMutex;
use std::pin::Pin;
mod extension_host;
mod db;
mod ai;
mod config;
mod task_decomposition;
mod conversation;

use extension_host::{ExtensionHostState, start_extension_host, stop_extension_host, activate_extension, deactivate_extension, extension_host_execute_command};
use ai::{
    AiConfig, ChatRequest, ChatMessage, ChatResponse, ChatStreamChunk,
    create_ai_client, AiError
};
use task_decomposition::{
    RequirementAnalyzer, TaskDecomposer, IntentClassifier,
    UserRequirement, RequirementIntent, ComplexityLevel, DomainType, ProjectContext,
    DevelopmentTask, TaskType, Priority
};
use conversation::{get_conversation_manager, Conversation, ConversationConfig};
use db::{
    DbRegistry,
    db_add_connection,
    db_add_connection_for_project,
    db_update_connection,
    db_update_connection_for_project,
    db_rename_connection_for_project,
    db_remove_connection,
    db_remove_connection_for_project,
    db_list_connections,
    db_clear_connections,
    db_list_databases,
    db_list_schemas,
    db_load_connections,
    db_save_connections,
    db_test_connection,
    db_query_sql,
    db_query_sql_paged,
    db_list_tables,
    db_list_columns,
    db_mongo_list_databases,
    db_mongo_list_collections,
    db_mongo_run_command,
    db_redis_cmd,
    db_redis_info,
};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::ZipArchive;

#[derive(Debug, Serialize, Deserialize)]
struct AppState {
    theme: String,
    window_title: String,
}

// 以 base64 返回远程资源（用于绕过 WebView 的 CORS，如扩展图标）
#[tauri::command]
async fn fetch_url_base64(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("GoPilot/1.0.0")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP 错误: {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    use base64::{Engine as _, engine::general_purpose};
    Ok(general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
async fn extract_vsix(vsix_path: String, dest_dir: String) -> Result<(), String> {
    let dest = Path::new(&dest_dir);
    fs::create_dir_all(dest).map_err(|e| format!("创建目录失败: {} - {}", dest.display(), e))?;

    let file = std::fs::File::open(&vsix_path).map_err(|e| format!("打开 VSIX 失败: {} - {}", vsix_path, e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("解析 VSIX 失败: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("读取 VSIX 条目失败: {}", e))?;
        let Some(name) = entry.enclosed_name() else { continue };
        let out_path = dest.join(name);

        if entry.name().ends_with('/') {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("创建目录失败: {} - {}", out_path.display(), e))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败: {} - {}", parent.display(), e))?;
        }

        let mut outfile = std::fs::File::create(&out_path)
            .map_err(|e| format!("创建文件失败: {} - {}", out_path.display(), e))?;
        std::io::copy(&mut entry, &mut outfile)
            .map_err(|e| format!("解压失败: {} - {}", out_path.display(), e))?;
    }

    Ok(())
}

#[tauri::command]
async fn search_workspace(path: String, query: String, max_results: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let limit = max_results.unwrap_or(500);

    // First try ripgrep (fast). If rg is not installed, fall back to a Rust scan.
    let rg_output = Command::new("rg")
        .args(["--vimgrep", "--no-heading", "--color", "never", q, "."])
        .current_dir(&path)
        .output();

    if let Ok(output) = rg_output {
        // rg uses exit code 1 for no matches
        if !output.status.success() {
            let code = output.status.code().unwrap_or(-1);
            if code == 1 {
                return Ok(vec![]);
            }
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Search failed: {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut out = Vec::new();
        for line in stdout.lines().take(min(limit, 10_000)) {
            // vimgrep format: file:line:col:text
            let mut parts = line.splitn(4, ':');
            let file = parts.next().unwrap_or("").to_string();
            let line_no = parts.next().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
            let col_no = parts.next().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
            let text = parts.next().unwrap_or("").to_string();
            if file.is_empty() || line_no <= 0 {
                continue;
            }
            let base = path.trim_end_matches(&['\\', '/'][..]);
            let rel = file.replace('/', "\\");
            out.push(serde_json::json!({
                "path": format!("{}\\{}", base, rel),
                "line": line_no,
                "column": col_no,
                "text": text,
            }));
            if out.len() >= limit {
                break;
            }
        }
        return Ok(out);
    }

    fn scan_dir(base: &str, dir: &Path, q: &str, limit: usize, out: &mut Vec<serde_json::Value>) {
        if out.len() >= limit {
            return;
        }
        let rd = match fs::read_dir(dir) {
            Ok(v) => v,
            Err(_) => return,
        };
        for ent in rd.flatten() {
            if out.len() >= limit {
                return;
            }
            let p = ent.path();
            // Skip common heavy folders
            if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                if name == "node_modules" || name == ".git" || name == "dist" || name == "target" {
                    continue;
                }
            }
            if p.is_dir() {
                scan_dir(base, &p, q, limit, out);
                continue;
            }
            let meta = match ent.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            // Skip large files
            if meta.len() > 1024 * 1024 {
                continue;
            }
            let content = match fs::read_to_string(&p) {
                Ok(s) => s,
                Err(_) => continue,
            };
            for (idx, line) in content.lines().enumerate() {
                if out.len() >= limit {
                    return;
                }
                if let Some(pos) = line.find(q) {
                    out.push(serde_json::json!({
                        "path": p.to_string_lossy().to_string(),
                        "line": (idx + 1) as i64,
                        "column": (pos + 1) as i64,
                        "text": line.to_string(),
                    }));
                }
            }
        }
    }

    let mut out = Vec::new();
    let base_path = Path::new(&path);
    scan_dir(&path, base_path, q, limit, &mut out);
    Ok(out)
}

// 存储正在运行的进程
type ProcessMap = Arc<Mutex<HashMap<String, Child>>>;

type TerminalSessionMap = Arc<Mutex<HashMap<String, TerminalSession>>>;

struct TerminalSession {
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
    // Keep master alive so reader thread stays connected
    _master: Box<dyn portable_pty::MasterPty + Send>,
}

#[tauri::command]
async fn terminal_start(
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    window: Window,
    sessions: State<'_, TerminalSessionMap>,
) -> Result<String, String> {
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let session_id = format!("term_{}", ts);

    let system = native_pty_system();
    let pair = system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = if cfg!(target_os = "windows") {
        // Use PowerShell by default to match VSCode-ish behavior
        "powershell.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
    };

    let mut cmd = CommandBuilder::new(shell);
    if let Some(dir) = cwd {
        if !dir.trim().is_empty() {
            cmd.cwd(dir);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let master_for_store = pair.master;

    sessions.lock().unwrap().insert(
        session_id.clone(),
        TerminalSession {
            writer,
            child,
            _master: master_for_store,
        },
    );

    let window_clone = window.clone();
    let session_id_clone = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = window_clone.emit(
                        "terminal-data",
                        serde_json::json!({
                            "sessionId": session_id_clone,
                            "data": text,
                        }),
                    );
                }
                Err(_) => break,
            }
        }
    });

    Ok(session_id)
}

#[tauri::command]
async fn terminal_write(session_id: String, data: String, sessions: State<'_, TerminalSessionMap>) -> Result<(), String> {
    let mut map = sessions.lock().unwrap();
    let sess = map.get_mut(&session_id).ok_or_else(|| "Terminal session not found".to_string())?;
    sess.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    sess.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn terminal_resize(session_id: String, cols: u16, rows: u16, sessions: State<'_, TerminalSessionMap>) -> Result<(), String> {
    let mut map = sessions.lock().unwrap();
    let sess = map.get_mut(&session_id).ok_or_else(|| "Terminal session not found".to_string())?;
    sess._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn terminal_kill(session_id: String, sessions: State<'_, TerminalSessionMap>) -> Result<(), String> {
    let mut map = sessions.lock().unwrap();
    if let Some(mut sess) = map.remove(&session_id) {
        let _ = sess.child.kill();
        let _ = sess.child.wait();
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct FileEntry {
    name: String,
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
    children: Option<Vec<FileEntry>>,
}

// Learn more about Tauri commands at https://tauri.app/v2/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "GoPilot",
        "version": "1.0.0",
        "description": "A modern code editor for Go development"
    })
}

#[tauri::command]
fn set_theme(theme: &str, _state: State<AppState>) -> Result<(), String> {
    println!("Setting theme to: {}", theme);
    Ok(())
}

#[tauri::command]
fn get_theme(state: State<AppState>) -> String {
    state.theme.clone()
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_binary_file(path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn append_file(path: String, content: String) -> Result<(), String> {
    use std::fs::OpenOptions;

    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&path);
    
    if !dir_path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    
    match fs::read_dir(dir_path) {
        Ok(dir_entries) => {
            for entry in dir_entries {
                if let Ok(entry) = entry {
                    let entry_path = entry.path();
                    let name = entry_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    
                    let full_path = entry_path.to_string_lossy().to_string();
                    let entry_type = if entry_path.is_dir() {
                        "directory"
                    } else {
                        "file"
                    };
                    
                    entries.push(FileEntry {
                        name,
                        path: full_path,
                        entry_type: entry_type.to_string(),
                        children: None,
                    });
                }
            }
        }
        Err(e) => return Err(e.to_string()),
    }
    
    Ok(entries)
}

#[tauri::command]
async fn read_directory_tree(path: String, max_depth: Option<u32>) -> Result<Vec<FileEntry>, String> {
    let max_depth = max_depth.unwrap_or(5);
    let mut entries = Vec::new();
    
    fn read_dir_recursive(
        dir_path: &Path,
        max_depth: u32,
        current_depth: u32,
    ) -> Result<Vec<FileEntry>, String> {
        if current_depth > max_depth {
            return Ok(Vec::new());
        }
        
        let mut entries = Vec::new();
        
        match fs::read_dir(dir_path) {
            Ok(dir_entries) => {
                for entry in dir_entries {
                    if let Ok(entry) = entry {
                        let entry_path = entry.path();
                        let name = entry_path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_string();
                        
                        let full_path = entry_path.to_string_lossy().to_string();
                        let is_dir = entry_path.is_dir();
                        let entry_type = if is_dir {
                            "directory"
                        } else {
                            "file"
                        };
                        
                        let mut file_entry = FileEntry {
                            name,
                            path: full_path.clone(),
                            entry_type: entry_type.to_string(),
                            children: None,
                        };
                        
                        // 如果是目录且未达到最大深度，递归读取子目录
                        if is_dir && current_depth < max_depth {
                            match read_dir_recursive(&entry_path, max_depth, current_depth + 1) {
                                Ok(children) => {
                                    if !children.is_empty() {
                                        file_entry.children = Some(children);
                                    }
                                }
                                Err(e) => {
                                    eprintln!("Error reading subdirectory {}: {}", full_path, e);
                                }
                            }
                        }
                        
                        entries.push(file_entry);
                    }
                }
            }
            Err(e) => return Err(e.to_string()),
        }
        
        // 排序：文件夹优先，然后按名称排序
        entries.sort_by(|a, b| {
            // 先按类型排序：directory 优先于 file
            match (a.entry_type.as_str(), b.entry_type.as_str()) {
                ("directory", "file") => std::cmp::Ordering::Less,
                ("file", "directory") => std::cmp::Ordering::Greater,
                _ => {
                    // 同类型时按名称排序（不区分大小写）
                    a.name.to_lowercase().cmp(&b.name.to_lowercase())
                }
            }
        });
        
        Ok(entries)
    }
    
    let dir_path = Path::new(&path);
    if !dir_path.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    
    entries = read_dir_recursive(dir_path, max_depth, 0)?;
    
    Ok(entries)
}

#[tauri::command]
async fn create_file(path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

// 下载文件命令
#[tauri::command]
async fn download_file(url: String, save_path: String) -> Result<(), String> {
    println!("开始下载文件: {} -> {}", url, save_path);
    
    // 创建 reqwest 客户端，设置超时和用户代理
    let client = reqwest::Client::builder()
        // Large extensions can be hundreds of MB; avoid timing out while reading the body.
        .timeout(std::time::Duration::from_secs(60 * 30)) // 30分钟超时
        .user_agent("GoPilot/1.0.0")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
    
    println!("发送 HTTP 请求...");
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载失败: {}", e))?;
    
    println!("收到响应，状态码: {}", response.status());
    
    if !response.status().is_success() {
        return Err(format!("HTTP 错误: {} - {}", response.status(), response.status().canonical_reason().unwrap_or("未知错误")));
    }
    
    // 获取内容长度（如果可用）
    let content_length = response.content_length();
    if let Some(len) = content_length {
        println!("文件大小: {} 字节", len);
    }
    
    // 确保目录存在
    if let Some(parent) = Path::new(&save_path).parent() {
        println!("创建目录: {:?}", parent);
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {} - {}", parent.display(), e))?;
    }

    // Try to speed up large downloads via parallel range requests if the server supports it.
    // Fallback to the existing single-stream download if range isn't supported.
    let accept_ranges = response
        .headers()
        .get(reqwest::header::ACCEPT_RANGES)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    let supports_range = accept_ranges.contains("bytes");

    let should_parallel = supports_range
        && content_length.unwrap_or(0) >= 8 * 1024 * 1024; // only parallelize for >= 8MB

    if should_parallel {
        let total = content_length.unwrap_or(0);
        let concurrency: u64 = 6;
        let part_size = (total + concurrency - 1) / concurrency;
        println!("检测到 Range 支持，启用并发下载: {} 路，总大小: {} 字节", concurrency, total);

        let mut tasks = Vec::new();
        for part_index in 0..concurrency {
            let start = part_index * part_size;
            if start >= total {
                break;
            }
            let end = min(total - 1, start + part_size - 1);
            let range_header = format!("bytes={}-{}", start, end);
            let part_path = format!("{}.part{}", save_path, part_index);
            let url_clone = url.clone();
            let client_clone = client.clone();

            tasks.push(tokio::spawn(async move {
                println!("下载分片 {}: {} -> {}", part_index, range_header, part_path);
                let resp = client_clone
                    .get(&url_clone)
                    .header(reqwest::header::RANGE, range_header)
                    .send()
                    .await
                    .map_err(|e| format!("下载分片失败(part {}): {}", part_index, e))?;

                if !(resp.status().is_success() || resp.status() == reqwest::StatusCode::PARTIAL_CONTENT) {
                    return Err(format!(
                        "下载分片 HTTP 错误(part {}): {}",
                        part_index,
                        resp.status()
                    ));
                }

                let mut f = tokio::fs::File::create(&part_path)
                    .await
                    .map_err(|e| format!("创建分片文件失败(part {}): {}", part_index, e))?;
                let mut stream = resp.bytes_stream();
                while let Some(item) = stream.next().await {
                    let chunk = item.map_err(|e| format!("读取分片响应失败(part {}): {}", part_index, e))?;
                    f.write_all(&chunk)
                        .await
                        .map_err(|e| format!("写入分片文件失败(part {}): {}", part_index, e))?;
                }
                f.flush()
                    .await
                    .map_err(|e| format!("刷新分片文件失败(part {}): {}", part_index, e))?;
                Ok::<String, String>(part_path)
            }));
        }

        let mut part_paths: Vec<String> = Vec::new();
        for t in tasks {
            match t.await {
                Ok(Ok(p)) => part_paths.push(p),
                Ok(Err(e)) => {
                    return Err(e);
                }
                Err(e) => {
                    return Err(format!("下载分片任务异常: {}", e));
                }
            }
        }

        // Merge parts in order.
        part_paths.sort_by(|a, b| {
            let ai = a.rsplit(".part").next().and_then(|x| x.parse::<u64>().ok()).unwrap_or(0);
            let bi = b.rsplit(".part").next().and_then(|x| x.parse::<u64>().ok()).unwrap_or(0);
            ai.cmp(&bi)
        });

        println!("合并分片到目标文件...");
        let save_path_clone = save_path.clone();
        let part_paths_for_merge = part_paths.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut out = std::fs::File::create(&save_path_clone)
                .map_err(|e| format!("创建文件失败: {} - {}", save_path_clone, e))?;
            for p in &part_paths_for_merge {
                let mut inp = std::fs::File::open(p)
                    .map_err(|e| format!("打开分片失败: {} - {}", p, e))?;
                std::io::copy(&mut inp, &mut out)
                    .map_err(|e| format!("合并分片失败: {} - {}", p, e))?;
            }
            Ok(())
        })
        .await
        .map_err(|e| format!("合并任务异常: {}", e))??;

        // Cleanup part files.
        for p in part_paths {
            let _ = tokio::fs::remove_file(&p).await;
        }

        println!("文件下载完成(并发): {}", save_path);
        Ok(())
    } else {
        println!("读取响应数据并写入文件...");
        let mut file = std::fs::File::create(&save_path)
            .map_err(|e| format!("创建文件失败: {} - {}", save_path, e))?;

        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();
        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|e| format!("读取响应失败: {}", e))?;
            std::io::Write::write_all(&mut file, &chunk)
                .map_err(|e| format!("写入文件失败: {} - {}", save_path, e))?;
            downloaded += chunk.len() as u64;
            if let Some(total) = content_length {
                if total > 0 && downloaded % (10 * 1024 * 1024) < chunk.len() as u64 {
                    println!("下载进度: {}/{} 字节", downloaded, total);
                }
            } else if downloaded % (10 * 1024 * 1024) < chunk.len() as u64 {
                println!("下载进度: {} 字节", downloaded);
            }
        }

        println!("数据写入完成，大小: {} 字节", downloaded);
        println!("文件下载完成: {}", save_path);
        Ok(())
    }
}

// 对话框相关命令
#[tauri::command]
async fn open_folder_dialog() -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tauri::api::dialog::FileDialogBuilder::new()
        .set_title("选择文件夹")
        .pick_folder(move |path_buf| {
            let result = path_buf.map(|p| p.to_string_lossy().to_string());
            tx.send(result).ok();
        });
    
    // 等待对话框结果
    match rx.await {
        Ok(Some(path)) => Ok(Some(path)),
        Ok(None) => Ok(None),
        Err(_) => Err("对话框已取消".to_string()),
    }
}

#[tauri::command]
async fn open_file_dialog() -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tauri::api::dialog::FileDialogBuilder::new()
        .set_title("选择文件")
        .pick_file(move |path_buf| {
            let result = path_buf.map(|p| p.to_string_lossy().to_string());
            tx.send(result).ok();
        });
    
    // 等待对话框结果
    match rx.await {
        Ok(Some(path)) => Ok(Some(path)),
        Ok(None) => Ok(None),
        Err(_) => Err("对话框已取消".to_string()),
    }
}

// 终端相关命令
#[tauri::command]
async fn execute_command(command: String, working_dir: Option<String>) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &command])
            .current_dir(working_dir.unwrap_or_else(|| ".".to_string()))
            .output()
    } else {
        // 在 macOS/Linux 上，使用用户的默认 shell 并加载登录配置
        // 这样可以确保 PATH 等环境变量正确设置
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        Command::new(&shell)
            .arg("-l")  // 登录 shell，会加载配置文件
            .arg("-c")
            .arg(&command)
            .current_dir(working_dir.unwrap_or_else(|| ".".to_string()))
            .output()
    };

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !output.status.success() {
                Err(format!("{}\n{}", stdout, stderr))
            } else {
                Ok(stdout.to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_current_directory() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn change_directory(path: String) -> Result<String, String> {
    std::env::set_current_dir(&path).map_err(|e| e.to_string())?;
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

// Git 相关命令
#[tauri::command]
async fn is_git_repository(path: String) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(&path)
        .output();
    
    Ok(output.is_ok() && output.unwrap().status.success())
}

#[tauri::command]
async fn git_init(path: String) -> Result<(), String> {
    Command::new("git")
        .args(["init"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn git_status(path: String) -> Result<Vec<serde_json::Value>, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain", "-z"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err("Git status failed".to_string());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut status_list = Vec::new();
    
    // 解析 -z 格式的输出（以 \0 分隔）
    for entry in stdout.split('\0') {
        if entry.trim().is_empty() {
            continue;
        }
        
        let trimmed = entry.trim();
        if trimmed.len() < 3 {
            continue;
        }
        
        let status_code = &trimmed[0..2];
        let file_path = trimmed[2..].trim();
        
        if file_path.is_empty() {
            continue;
        }
        
        let status = if status_code.starts_with('M') {
            "modified"
        } else if status_code.starts_with('A') {
            "added"
        } else if status_code.starts_with('D') {
            "deleted"
        } else if status_code.starts_with('R') {
            "renamed"
        } else if status_code.starts_with('?') {
            "untracked"
        } else {
            "modified"
        };
        
        let is_staged = status_code.chars().nth(0).map(|c| c != ' ' && c != '?').unwrap_or(false);
        
        status_list.push(serde_json::json!({
            "path": file_path,
            "status": status,
            "isStaged": is_staged,
        }));
    }
    
    Ok(status_list)
}

#[tauri::command]
async fn git_current_branch(path: String) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Ok(None);
    }
    
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if branch.is_empty() { None } else { Some(branch) })
}

#[tauri::command]
async fn git_branches(path: String) -> Result<Vec<serde_json::Value>, String> {
    let output = Command::new("git")
        .args(["branch", "-a"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err("Git branch failed".to_string());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches = Vec::new();
    
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        
        let is_current = trimmed.starts_with('*');
        let is_remote = trimmed.starts_with("remotes/");
        let name = if is_current {
            trimmed[1..].trim()
        } else if is_remote {
            trimmed.strip_prefix("remotes/").unwrap_or(trimmed)
        } else {
            trimmed
        };
        
        branches.push(serde_json::json!({
            "name": name,
            "isCurrent": is_current,
            "isRemote": is_remote,
        }));
    }
    
    Ok(branches)
}

#[tauri::command]
async fn git_checkout(path: String, branch: String) -> Result<(), String> {
    Command::new("git")
        .args(["checkout", &branch])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn git_create_branch(path: String, branch: String) -> Result<(), String> {
    Command::new("git")
        .args(["checkout", "-b", &branch])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn git_add(path: String, files: Vec<String>) -> Result<(), String> {
    let mut cmd = Command::new("git");
    cmd.args(["add"]).args(&files).current_dir(&path);
    cmd.output().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn git_commit(path: String, message: String) -> Result<(), String> {
    Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn git_log(path: String, limit: Option<u32>) -> Result<Vec<serde_json::Value>, String> {
    let limit = limit.unwrap_or(50);
    let output = Command::new("git")
        .args([
            "log",
            "--format=%H|%s|%an|%at|%D",
            &format!("-{}", limit),
        ])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err("Git log failed".to_string());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();
    
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 4 {
            continue;
        }
        
        let hash = parts[0];
        let message = parts[1];
        let author = parts[2];
        let timestamp_str = parts[3];
        
        let timestamp: i64 = timestamp_str.parse().unwrap_or(0);
        let datetime = if let Some(dt) = DateTime::from_timestamp(timestamp, 0) {
            dt.to_rfc3339()
        } else {
            "Invalid Date".to_string()
        };
        
        let refs = if parts.len() > 4 {
            parts[4].to_string()
        } else {
            String::new()
        };
        
        commits.push(serde_json::json!({
            "hash": hash,
            "message": message,
            "author": author,
            "date": datetime,
            "timestamp": timestamp,
            "refs": refs,
        }));
    }
    
    Ok(commits)
}

#[tauri::command]
async fn git_pull(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["pull"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if stderr.trim().is_empty() {
        stdout.clone()
    } else if stdout.trim().is_empty() {
        stderr.clone()
    } else {
        format!("{}\n{}", stdout.trim_end(), stderr.trim_end())
    };

    if output.status.success() {
        Ok(combined)
    } else {
        Err(if combined.trim().is_empty() { "Git pull failed".to_string() } else { combined })
    }
}

#[tauri::command]
async fn git_push(path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["push"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if stderr.trim().is_empty() {
        stdout.clone()
    } else if stdout.trim().is_empty() {
        stderr.clone()
    } else {
        format!("{}\n{}", stdout.trim_end(), stderr.trim_end())
    };

    if output.status.success() {
        Ok(combined)
    } else {
        Err(if combined.trim().is_empty() { "Git push failed".to_string() } else { combined })
    }
}

#[tauri::command]
async fn git_discard(path: String, file: String) -> Result<(), String> {
    Command::new("git")
        .args(["checkout", "--", &file])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn git_diff(path: String, file: String) -> Result<serde_json::Value, String> {
    // 先检查是否有暂存的更改
    let staged_output = Command::new("git")
        .args(["diff", "--cached", "--", &file])
        .current_dir(&path)
        .output();
    
    let output = if let Ok(output) = staged_output {
        if output.status.success() && !output.stdout.is_empty() {
            output
        } else {
            // 如果没有暂存更改，检查工作区更改
            Command::new("git")
                .args(["diff", "--", &file])
                .current_dir(&path)
                .output()
                .map_err(|e| e.to_string())?
        }
    } else {
        Command::new("git")
            .args(["diff", "--", &file])
            .current_dir(&path)
            .output()
            .map_err(|e| e.to_string())?
    };
    
    if !output.status.success() {
        // 可能是新文件，尝试读取文件内容
        let file_path = Path::new(&path).join(&file);
        if file_path.exists() {
            let content = fs::read_to_string(&file_path).unwrap_or_default();
            let lines: Vec<String> = content.lines().map(|l| format!("+{}", l)).collect();
            return Ok(serde_json::json!({
                "file": file,
                "additions": lines.len(),
                "deletions": 0,
                "hunks": [{
                    "oldStart": 0,
                    "oldLines": 0,
                    "newStart": 1,
                    "newLines": lines.len(),
                    "lines": lines,
                }],
            }));
        }
        return Err("File not found".to_string());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut additions = 0;
    let mut deletions = 0;
    let mut hunks = Vec::new();
    let mut current_hunk: Option<serde_json::Value> = None;
    let mut hunk_lines = Vec::new();
    let mut old_start = 0;
    let mut old_lines = 0;
    let mut new_start = 0;
    let mut new_lines = 0;
    
    for line in stdout.lines() {
        if line.starts_with("@@") {
            // 保存上一个 hunk
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            
            // 解析 hunk 头
            let re = regex::Regex::new(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@").unwrap();
            if let Some(caps) = re.captures(line) {
                old_start = caps.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
                old_lines = caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(1);
                new_start = caps.get(3).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
                new_lines = caps.get(4).and_then(|m| m.as_str().parse().ok()).unwrap_or(1);
            }
            
            hunk_lines = Vec::new();
        } else if line.starts_with('+') && !line.starts_with("+++") {
            additions += 1;
            hunk_lines.push(serde_json::json!({
                "type": "added",
                "content": line[1..].to_string(),
            }));
        } else if line.starts_with('-') && !line.starts_with("---") {
            deletions += 1;
            hunk_lines.push(serde_json::json!({
                "type": "deleted",
                "content": line[1..].to_string(),
            }));
        } else if !line.starts_with("diff") && !line.starts_with("index") && !line.starts_with("---") && !line.starts_with("+++") {
            hunk_lines.push(serde_json::json!({
                "type": "context",
                "content": line.to_string(),
            }));
        }
    }
    
    // 保存最后一个 hunk
    if !hunk_lines.is_empty() {
        hunks.push(serde_json::json!({
            "oldStart": old_start,
            "oldLines": old_lines,
            "newStart": new_start,
            "newLines": new_lines,
            "lines": hunk_lines,
        }));
    }
    
    Ok(serde_json::json!({
        "file": file,
        "additions": additions,
        "deletions": deletions,
        "hunks": hunks,
    }))
}

#[tauri::command]
async fn git_branch_graph(path: String) -> Result<serde_json::Value, String> {
    let output = Command::new("git")
        .args([
            "log",
            "--all",
            "--graph",
            "--pretty=format:%h|%s|%an|%at|%d",
            "--decorate",
            "-30",
        ])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err("Git log failed".to_string());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut graph_lines = Vec::new();
    
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        
        // 提取图形字符和提交信息
        let graph_chars: String = line.chars().take_while(|c| !c.is_alphanumeric() && *c != '|').collect();
        let commit_part = line.trim_start_matches(|c: char| !c.is_alphanumeric() && c != '|');
        
        // 如果 commit_part 为空或只包含空白字符，说明这行只有图形字符，跳过
        if commit_part.trim().is_empty() {
            continue;
        }
        
        let parts: Vec<&str> = commit_part.split('|').collect();
        // 至少需要4个部分：hash, message, author, timestamp
        if parts.len() >= 4 {
            let timestamp = parts.get(3)
                .and_then(|s| s.trim().parse::<i64>().ok())
                .unwrap_or(0);
            
            graph_lines.push(serde_json::json!({
                "graph": graph_chars,
                "hash": parts.get(0).unwrap_or(&"").trim(),
                "message": parts.get(1).unwrap_or(&"").trim(),
                "author": parts.get(2).unwrap_or(&"").trim(),
                "timestamp": timestamp,
                "refs": parts.get(4).unwrap_or(&"").trim(),
            }));
        }
        // 如果部分数量不足，说明这行只包含图形字符，静默跳过（不再打印警告）
    }
    
    Ok(serde_json::json!({
        "lines": graph_lines,
    }))
}

// 流式命令执行
#[tauri::command]
async fn execute_command_stream(
    command: String,
    working_dir: Option<String>,
    process_id: String,
    window: Window,
    processes: State<'_, ProcessMap>,
) -> Result<(), String> {
    let working_dir = working_dir.unwrap_or_else(|| ".".to_string());
    
    #[cfg(unix)]
    use libc::setpgid;
    
    let mut child = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &command])
            .current_dir(&working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?
    } else {
        // 在 macOS/Linux 上，使用用户的默认 shell 并加载登录配置
        // 这样可以确保 PATH 等环境变量正确设置
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut cmd = Command::new(&shell);
        cmd.arg("-l")  // 登录 shell，会加载配置文件
            .arg("-c")
            .arg(&command)
            .current_dir(&working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    let result = setpgid(0, 0);
                    if result != 0 {
                        return Err(std::io::Error::from_raw_os_error(result));
                    }
                    Ok(())
                });
            }
        }
        
        cmd.spawn().map_err(|e| e.to_string())?
    };
    
    let _pid = child.id();
    processes.lock().unwrap().insert(process_id.clone(), child);
    
    let stdout = processes.lock().unwrap().get_mut(&process_id)
        .and_then(|c| c.stdout.take())
        .ok_or("Failed to get stdout".to_string())?;
    
    let stderr = processes.lock().unwrap().get_mut(&process_id)
        .and_then(|c| c.stderr.take())
        .ok_or("Failed to get stderr".to_string())?;
    
    let window_clone = window.clone();
    let _process_id_clone = process_id.clone();
    // 不需要 clone 整个 processes，在需要时获取锁
    
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                window_clone.emit("command-output", serde_json::json!({
                    "line": line,
                    "is_error": false,
                })).ok();
            }
        }
    });
    
    let window_clone2 = window.clone();
    let _process_id_clone2 = process_id.clone();
    // 不需要 clone 整个 processes，在需要时获取锁
    
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                window_clone2.emit("command-output", serde_json::json!({
                    "line": line,
                    "is_error": true,
                })).ok();
            }
        }
        
        // 等待进程结束 - 这个逻辑需要重新设计，因为不能跨线程传递 MutexGuard
        // 暂时注释掉，后续可以重新实现进程结束检测
    });
    
    Ok(())
}

#[tauri::command]
async fn kill_command(
    process_id: String,
    processes: State<'_, ProcessMap>,
) -> Result<(), String> {
    if let Some(mut child) = processes.lock().unwrap().remove(&process_id) {
        #[cfg(unix)]
        {
            use libc::{kill, SIGTERM};
            let pid = child.id() as i32;
            unsafe {
                kill(-pid, SIGTERM);
            }
        }
        
        #[cfg(windows)]
        {
            child.kill().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// AI 配置状态
static AI_CONFIG: TokioMutex<Option<AiConfig>> = TokioMutex::const_new(None);

/// 设置 AI 配置
#[tauri::command]
async fn ai_set_config(config: AiConfig) -> Result<(), String> {
    let mut global_config = AI_CONFIG.lock().await;
    *global_config = Some(config);
    Ok(())
}

/// 获取 AI 配置
#[tauri::command]
async fn ai_get_config() -> Result<Option<AiConfig>, String> {
    let config = AI_CONFIG.lock().await;
    Ok(config.clone())
}

/// 测试 AI 连接
#[tauri::command]
async fn ai_test_connection(config: AiConfig) -> Result<String, String> {
    let client = create_ai_client(config);
    
    let test_request = ChatRequest {
        model: "gpt-3.5-turbo".to_string(), // 使用默认模型进行测试
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Hello, this is a connection test. Please respond with 'Connection successful'.".to_string(),
        }],
        temperature: Some(0.1),
        max_tokens: Some(50),
        stream: Some(false),
    };

    match client.chat(test_request).await {
        Ok(response) => {
            if let Some(choice) = response.choices.first() {
                Ok(format!("连接成功！\n模型: {}\n响应: {}", response.model, choice.message.content))
            } else {
                Err("连接成功但无响应内容".to_string())
            }
        }
        Err(e) => Err(format!("连接失败: {}", e)),
    }
}

/// AI 聊天（非流式）
#[tauri::command]
async fn ai_chat(request: ChatRequest) -> Result<ChatResponse, String> {
    println!("🔍 AI 聊天请求: {:?}", request);
    
    let config = AI_CONFIG.lock().await;
    println!("🔍 当前 AI 配置: {:?}", config);
    
    if let Some(config) = config.as_ref() {
        println!("✅ 使用配置创建 AI 客户端");
        let client = create_ai_client(config.clone());
        println!("✅ AI 客户端创建成功，开始聊天");
        
        let result = client.chat(request).await;
        println!("🔍 聊天结果: {:?}", result);
        
        match result {
            Ok(response) => {
                println!("✅ 聊天成功");
                Ok(response)
            }
            Err(e) => {
                println!("❌ 聊天失败: {:?}", e);
                Err(e.to_string())
            }
        }
    } else {
        println!("❌ AI 配置未设置");
        Err("AI 配置未设置".to_string())
    }
}

/// AI 聊天（流式）
#[tauri::command]
async fn ai_chat_stream(
    request: ChatRequest,
    window: tauri::Window,
) -> Result<(), String> {
    let config = AI_CONFIG.lock().await;
    
    if let Some(config) = config.as_ref() {
        let client = create_ai_client(config.clone());
        let stream: Pin<Box<dyn futures_util::Stream<Item = Result<ChatStreamChunk, AiError>> + Send>> = client.chat_stream(request).await.map_err(|e| e.to_string())?;
        
        let mut stream = stream;
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    if let Some(choice) = chunk.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            if let Err(e) = window.emit("ai-chat-chunk", content) {
                                eprintln!("发送聊天块失败: {}", e);
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = window.emit("ai-chat-error", e.to_string());
                    break;
                }
            }
        }
        
        // 发送结束信号
        let _ = window.emit("ai-chat-end", "");
        Ok(())
    } else {
        Err("AI 配置未设置".to_string())
    }
}

// 任务拆解相关命令
#[tauri::command]
async fn classify_requirement(text: String) -> Result<RequirementIntent, String> {
    let classifier = IntentClassifier::new();
    Ok(classifier.classify(&text))
}

#[tauri::command]
async fn estimate_complexity(requirement: String, project_context: ProjectContext) -> Result<ComplexityLevel, String> {
    let estimator = task_decomposition::ComplexityEstimator::new().map_err(|e| e.to_string())?;
    estimator.estimate(&requirement, &project_context).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn analyze_requirement(requirement_text: String, project_context: ProjectContext) -> Result<UserRequirement, String> {
    println!("🔍 分析需求: {}", requirement_text);
    println!("🔍 项目上下文: {:?}", project_context);
    
    let analyzer = RequirementAnalyzer::new().map_err(|e| e.to_string())?;
    let result = analyzer.analyze(requirement_text, project_context).await;
    
    match &result {
        Ok(requirement) => {
            println!("✅ 需求分析成功: {:?}", requirement);
        }
        Err(e) => {
            println!("❌ 需求分析失败: {}", e);
        }
    }
    
    result.map_err(|e| e.to_string())
}

#[tauri::command]
async fn decompose_requirement(requirement: UserRequirement) -> Result<Vec<DevelopmentTask>, String> {
    println!("🔍 拆解需求: {:?}", requirement);
    
    let decomposer = TaskDecomposer::new().map_err(|e| e.to_string())?;
    let result = decomposer.decompose(&requirement).await;
    
    match &result {
        Ok(tasks) => {
            println!("✅ 任务拆解成功，生成 {} 个任务", tasks.len());
            for (i, task) in tasks.iter().enumerate() {
                println!("  任务 {}: {}", i + 1, task.title);
            }
        }
        Err(e) => {
            println!("❌ 任务拆解失败: {}", e);
        }
    }
    
    result.map_err(|e| e.to_string())
}

#[tauri::command]
async fn simple_decompose_requirement(requirement: UserRequirement) -> Result<Vec<DevelopmentTask>, String> {
    println!("🔍 简单拆解需求: {:?}", requirement);
    
    let decomposer = TaskDecomposer::new().map_err(|e| e.to_string())?;
    let tasks = decomposer.simple_decompose(&requirement);
    
    println!("✅ 简单任务拆解成功，生成 {} 个任务", tasks.len());
    for (i, task) in tasks.iter().enumerate() {
        println!("  任务 {}: {}", i + 1, task.title);
    }
    
    Ok(tasks)
}

// ==================== 会话管理命令 ====================

/// 创建新会话
#[tauri::command]
async fn conversation_create(title: String) -> Result<String, String> {
    println!("🔍 创建新会话: {}", title);
    
    // 获取当前 AI 配置
    let ai_config = {
        let config = AI_CONFIG.lock().await;
        config.as_ref().cloned()
    };

    let ai_config = match ai_config {
        Some(v) => v,
        None => {
            println!("⚠️  AI 配置未设置，尝试从环境变量重新加载");
            let app_config = config::ConfigLoader::load_from_env()
                .map_err(|e| format!("AI 配置未设置，且重新加载失败: {}", e))?;

            let mut global_config = AI_CONFIG.lock().await;
            *global_config = Some(app_config.ai.clone());
            println!("✅ AI 配置已从环境变量重新加载并写入全局变量");
            app_config.ai
        }
    };
    
    let manager = get_conversation_manager();
    let conversation_id = manager.create_conversation(title, ai_config).await?;
    
    println!("✅ 会话创建成功: {}", conversation_id);
    Ok(conversation_id)
}

/// 获取会话信息
#[tauri::command]
async fn conversation_get(conversation_id: String) -> Result<Conversation, String> {
    println!("🔍 获取会话: {}", conversation_id);
    
    let manager = get_conversation_manager();
    let conversation = manager.get_conversation(&conversation_id).await
        .ok_or("会话不存在")?;
    
    println!("✅ 会话获取成功");
    Ok(conversation)
}

/// 发送消息到会话
#[tauri::command]
async fn conversation_send_message(conversation_id: String, content: String) -> Result<ChatResponse, String> {
    println!("🔍 发送消息到会话 {}: {}", conversation_id, content);
    
    let manager = get_conversation_manager();
    let response = manager.send_message(&conversation_id, content).await?;
    
    println!("✅ 消息发送成功");
    Ok(response)
}

/// 流式发送消息到会话
#[tauri::command]
async fn conversation_send_message_stream(
    conversation_id: String,
    content: String,
    request_id: String,
    window: tauri::Window,
) -> Result<(), String> {
    let manager = get_conversation_manager();
    manager
        .send_message_stream(&conversation_id, content, request_id, window)
        .await
}

/// 获取所有会话列表
#[tauri::command]
async fn conversation_list() -> Result<Vec<Conversation>, String> {
    println!("🔍 获取会话列表");
    
    let manager = get_conversation_manager();
    let conversations = manager.list_conversations().await;
    
    println!("✅ 获取到 {} 个会话", conversations.len());
    Ok(conversations)
}

/// 删除会话
#[tauri::command]
async fn conversation_delete(conversation_id: String) -> Result<(), String> {
    println!("🔍 删除会话: {}", conversation_id);
    
    let manager = get_conversation_manager();
    manager.delete_conversation(&conversation_id).await?;
    
    println!("✅ 会话删除成功");
    Ok(())
}

/// 清理旧会话
#[tauri::command]
async fn conversation_cleanup(days_old: u64) -> Result<usize, String> {
    println!("🔍 清理 {} 天前的会话", days_old);
    
    let manager = get_conversation_manager();
    let deleted_count = manager.cleanup_old_conversations(days_old).await?;
    
    println!("✅ 清理完成，删除了 {} 个会话", deleted_count);
    Ok(deleted_count)
}

fn main() {
    // 获取命令行参数（用于处理拖放的文件）
    // 在 macOS 上，拖放到应用图标上的文件会作为命令行参数传递
    // 尝试从环境变量获取文件路径（macOS 拖放通常通过这种方式传递）
    let file_paths: Vec<String> = std::env::args()
        .skip(1) // 跳过程序名
        .filter(|arg| {
            // 过滤掉 Tauri 的内部参数，只保留文件路径
            let is_valid = !arg.starts_with("--") && Path::new(arg).exists();
            if is_valid {
                println!("找到文件路径: {}", arg);
            }
            is_valid
        })
        .collect();
    
    println!("检测到的文件路径数量: {}", file_paths.len());

    // 自动加载 AI 配置
    let ai_config = match config::ConfigLoader::load_from_env() {
        Ok(app_config) => {
            println!("✅ 成功加载 AI 配置");
            Some(app_config.ai)
        }
        Err(e) => {
            println!("⚠️  加载 AI 配置失败: {}", e);
            None
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths: Vec<String> = argv
                .iter()
                .filter(|arg| {
                    let s = arg.to_string();
                    !s.starts_with("--") && Path::new(&s).exists()
                })
                .map(|arg| arg.to_string())
                .collect();

            if paths.is_empty() {
                return;
            }

            if let Some(window) = app.get_window("main") {
                let _ = window.emit("open-files", paths);
                let _ = window.set_focus();
            }
        }))
        .manage(AppState {
            theme: "dark".to_string(),
            window_title: "GoPilot".to_string(),
        })
        .manage(ProcessMap::default())
        .manage(TerminalSessionMap::default())
        .manage(Arc::new(Mutex::new(ExtensionHostState::default())))
        .manage(DbRegistry::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_info,
            set_theme,
            get_theme,
            read_file,
            read_binary_file,
            write_file,
            append_file,
            read_directory,
            fetch_url_base64,
            read_directory_tree,
            create_file,
            create_directory,
            terminal_start,
            terminal_write,
            terminal_resize,
            terminal_kill,
            execute_command,
            execute_command_stream,
            is_git_repository,
            git_current_branch,
            git_status,
            git_branches,
            git_checkout,
            git_create_branch,
            git_add,
            git_commit,
            git_log,
            git_pull,
            git_push,
            git_discard,
            git_diff,
            git_branch_graph,
            search_workspace,
            open_folder_dialog,
            open_file_dialog,
            git_init,
            download_file,
            extract_vsix,
            start_extension_host,
            stop_extension_host,
            activate_extension,
            deactivate_extension,
            extension_host_execute_command,
            db_add_connection,
            db_add_connection_for_project,
            db_update_connection,
            db_update_connection_for_project,
            db_rename_connection_for_project,
            db_remove_connection,
            db_remove_connection_for_project,
            db_list_connections,
            db_clear_connections,
            db_list_databases,
            db_list_schemas,
            db_load_connections,
            db_save_connections,
            db_test_connection,
            db_query_sql,
            db_query_sql_paged,
            db_list_tables,
            db_list_columns,
            db_mongo_list_databases,
            db_mongo_list_collections,
            db_mongo_run_command,
            db_redis_cmd,
            db_redis_info,
            ai_chat,
            ai_chat_stream,
            ai_set_config,
            ai_get_config,
            ai_test_connection,
            classify_requirement,
            estimate_complexity,
            analyze_requirement,
            decompose_requirement,
            simple_decompose_requirement,
            conversation_create,
            conversation_get,
            conversation_send_message,
            conversation_send_message_stream,
            conversation_list,
            conversation_delete,
            conversation_cleanup,
        ])
        .setup(move |app| {
            // 自动设置 AI 配置
            if let Some(ref config) = ai_config {
                tauri::async_runtime::spawn({
                    let config = config.clone();
                    async move {
                        let mut global_config = AI_CONFIG.lock().await;
                        *global_config = Some(config);
                        println!("✅ AI 配置已自动设置到全局变量");
                    }
                });
            }

            // 如果有启动参数（拖放的文件），发送事件到前端
            let file_paths_clone = file_paths.clone();
            if !file_paths_clone.is_empty() {
                println!("准备发送 {} 个文件路径到前端", file_paths_clone.len());
                let window = app.get_window("main").unwrap();
                // 延迟一点发送，确保前端已经准备好
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                    println!("发送 open-files 事件，文件路径: {:?}", file_paths_clone);
                    if let Err(e) = window.emit("open-files", file_paths_clone.clone()) {
                        eprintln!("发送事件失败: {:?}", e);
                    } else {
                        println!("事件发送成功");
                    }
                });
            } else {
                println!("没有检测到文件路径");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
