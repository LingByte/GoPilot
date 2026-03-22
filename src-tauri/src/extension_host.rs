use tauri::{command, State};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tokio::process::{Child, Command};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtensionHostMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtensionData {
    pub extension_id: String,
    pub extension_path: String,
    pub entry_point: String,
}

pub struct ExtensionHostState {
    process: Option<Child>,
    message_sender: Option<mpsc::UnboundedSender<ExtensionHostMessage>>,
}

impl Default for ExtensionHostState {
    fn default() -> Self {
        Self {
            process: None,
            message_sender: None,
        }
    }
}

#[command]
pub async fn start_extension_host(
    app_handle: tauri::AppHandle,
    window: tauri::Window,
    state: State<'_, Arc<Mutex<ExtensionHostState>>>,
) -> Result<(), String> {
    let mut state_guard = state.lock().unwrap();
    
    if state_guard.process.is_some() {
        return Err("Extension host already running".to_string());
    }

    // 查找 Extension Host 可执行文件
    let host_path = std::env::current_dir()
        .unwrap()
        .parent() // 回到项目根目录
        .unwrap()
        .join("src-extension-host")
        .join("dist")
        .join("index.js");

    if !host_path.exists() {
        return Err(format!("Extension host not found at: {:?}", host_path));
    }

    // 启动 Node.js Extension Host 进程
    let mut child = Command::new("node")
        .arg(host_path.to_string_lossy().to_string())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start extension host: {}", e))?;

    // 设置消息通道
    let (tx, mut rx) = mpsc::unbounded_channel::<ExtensionHostMessage>();
    state_guard.message_sender = Some(tx);

    // 处理进程输出
    if let Some(stdout) = child.stdout.take() {
        let window_clone = window.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                // 尝试解析 JSON 消息
                if let Ok(message) = serde_json::from_str::<ExtensionHostMessage>(&line) {
                    window_clone.emit("extension-host-message", message).ok();
                } else {
                    // 不是 JSON 消息，可能是日志输出
                    println!("[ExtensionHost] {}", line);
                }
            }
        });
    }

    // 处理错误输出
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[ExtensionHost] {}", line);
            }
        });
    }

    state_guard.process = Some(child);
    
    // 启动消息发送任务
    let tx_clone = state_guard.message_sender.clone();
    tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if let Some(sender) = &tx_clone {
                // 发送消息到进程 stdin
                // 这里需要实现 IPC 通信
            }
        }
    });

    println!("[ExtensionHost] Started successfully");
    Ok(())
}

#[command]
pub async fn stop_extension_host(
    state: State<'_, Arc<Mutex<ExtensionHostState>>>,
) -> Result<(), String> {
    let mut child_opt = {
        let mut state_guard = state.lock().unwrap();
        state_guard.process.take()
    };
    
    if let Some(mut child) = child_opt {
        child.kill().await.map_err(|e| format!("Failed to kill extension host: {}", e))?;
        let mut state_guard = state.lock().unwrap();
        state_guard.message_sender = None;
        println!("[ExtensionHost] Stopped");
    }
    
    Ok(())
}

#[command]
pub async fn activate_extension(
    extension_data: ExtensionData,
    state: State<'_, Arc<Mutex<ExtensionHostState>>>,
) -> Result<(), String> {
    let state_guard = state.lock().unwrap();
    
    if let Some(sender) = &state_guard.message_sender {
        let message = ExtensionHostMessage {
            message_type: "activate".to_string(),
            data: Some(serde_json::to_value(extension_data).map_err(|e| e.to_string())?),
        };
        
        sender.send(message).map_err(|e| format!("Failed to send message: {}", e))?;
    } else {
        return Err("Extension host not running".to_string());
    }
    
    Ok(())
}

#[command]
pub async fn deactivate_extension(
    extension_id: String,
    state: State<'_, Arc<Mutex<ExtensionHostState>>>,
) -> Result<(), String> {
    let state_guard = state.lock().unwrap();
    
    if let Some(sender) = &state_guard.message_sender {
        let message = ExtensionHostMessage {
            message_type: "deactivate".to_string(),
            data: Some(serde_json::json!({ "extensionId": extension_id })),
        };
        
        sender.send(message).map_err(|e| format!("Failed to send message: {}", e))?;
    } else {
        return Err("Extension host not running".to_string());
    }
    
    Ok(())
}

#[command]
pub async fn extension_host_execute_command(
    command: String,
    args: Vec<serde_json::Value>,
    state: State<'_, Arc<Mutex<ExtensionHostState>>>,
) -> Result<(), String> {
    let state_guard = state.lock().unwrap();
    
    if let Some(sender) = &state_guard.message_sender {
        let message = ExtensionHostMessage {
            message_type: "executeCommand".to_string(),
            data: Some(serde_json::json!({ 
                "command": command, 
                "args": args 
            })),
        };
        
        sender.send(message).map_err(|e| format!("Failed to send message: {}", e))?;
    } else {
        return Err("Extension host not running".to_string());
    }
    
    Ok(())
}
