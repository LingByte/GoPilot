# GoPilot Extension Host

Node.js Extension Host for GoPilot, providing full VSCode extension compatibility.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   UI Process    │    │ Extension Host  │
│  (Tauri/React)  │◄──►│    (Node.js)    │
│ - Renderer      │    │ - Full Node API │
│ - DOM/Canvas    │    │ - fs/net/crypto │
│ - Webview       │    │ - child_process │
└─────────────────┘    └─────────────────┘
```

## Communication Protocol

### From UI to Extension Host
- `activate`: Activate an extension
- `deactivate`: Deactivate an extension
- `executeCommand`: Execute a registered command

### From Extension Host to UI
- `ready`: Host is ready
- `activated`: Extension activated successfully
- `deactivated`: Extension deactivated
- `error`: Activation/execution error
- `output`: Output channel message
- `message`: Show message to user
- `commandRegistered`: New command registered
- `commandUnregistered`: Command disposed
- `commandResult`: Command execution result

## VSCode API Implementation

Currently implements:
- `vscode.window` (output channels, messages)
- `vscode.commands` (register/execute)
- `vscode.workspace` (configuration)
- `vscode.extensions` (basic)
- `vscode.env` (basic)
- `vscode.Uri` (basic)
- Disposable pattern

## Usage

The host process is started by the main GoPilot application and communicates via process IPC.
