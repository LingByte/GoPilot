// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, State, Window};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader};
use std::thread;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use chrono::DateTime;
use tauri_plugin_single_instance;

#[derive(Debug, Serialize, Deserialize)]
struct AppState {
    theme: String,
    window_title: String,
}

// 存储正在运行的进程
type ProcessMap = Arc<Mutex<HashMap<String, Child>>>;

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
        .timeout(std::time::Duration::from_secs(300)) // 5分钟超时
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
    
    println!("读取响应数据...");
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;
    
    println!("数据读取完成，大小: {} 字节", bytes.len());
    
    // 确保目录存在
    if let Some(parent) = Path::new(&save_path).parent() {
        println!("创建目录: {:?}", parent);
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {} - {}", parent.display(), e))?;
    }
    
    println!("保存文件到: {}", save_path);
    fs::write(&save_path, bytes.as_ref())
        .map_err(|e| format!("保存文件失败: {} - {}", save_path, e))?;
    
    println!("文件下载完成: {}", save_path);
    Ok(())
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
async fn git_pull(path: String) -> Result<(), String> {
    Command::new("git")
        .args(["pull"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn git_push(path: String) -> Result<(), String> {
    Command::new("git")
        .args(["push"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
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
    
    let pid = child.id();
    processes.lock().unwrap().insert(process_id.clone(), child);
    
    let stdout = processes.lock().unwrap().get_mut(&process_id)
        .and_then(|c| c.stdout.take())
        .ok_or("Failed to get stdout".to_string())?;
    
    let stderr = processes.lock().unwrap().get_mut(&process_id)
        .and_then(|c| c.stderr.take())
        .ok_or("Failed to get stderr".to_string())?;
    
    let window_clone = window.clone();
    let process_id_clone = process_id.clone();
    let processes_clone = processes.inner().clone();
    
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
    let process_id_clone2 = process_id.clone();
    let processes_clone2 = processes.inner().clone();
    
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
        
        // 等待进程结束
        if let Some(mut child) = processes_clone2.lock().unwrap().remove(&process_id_clone2) {
            let exit_code = child.wait().map(|s| s.code().unwrap_or(0)).unwrap_or(1);
            window_clone2.emit("command-finished", exit_code).ok();
        }
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
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_info,
            set_theme,
            get_theme,
            read_file,
            read_binary_file,
            write_file,
            read_directory,
            read_directory_tree,
            create_file,
            create_directory,
            delete_file,
            rename_file,
            path_exists,
            execute_command,
            execute_command_stream,
            get_current_directory,
            change_directory,
            kill_command,
            is_git_repository,
            git_status,
            git_current_branch,
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
            open_folder_dialog,
            open_file_dialog,
            git_init,
            download_file,
        ])
        .setup(move |app| {
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
