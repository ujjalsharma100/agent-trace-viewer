# Agent-Trace File Viewer

A **local** file viewer that lets you browse a project (like GitHub’s file browser), view file contents, and see **git blame** and **agent-trace blame** attribution inline. It is a separate installable product; the agent-trace CLI launches it with `agent-trace viewer` and reports "not available" if it isn’t installed.

## Requirements

- **Python 3.9+** (stdlib only; no pip)
- **git** (on PATH, for git blame)
- **curl** (for one-liner install)
- **Web browser** (to open the UI)

Optional for full UI: **Node/npm** (to build the React frontend; otherwise a minimal fallback UI is served).

## Install

### From GitHub (one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/ujjalsharma100/agent-trace-viewer/main/install.sh | bash
```

(Replace the repo URL/branch if you use a fork or different branch.)

### From a local clone (this repo)

1. Clone the repo and go to the viewer directory:

   ```bash
   git clone https://github.com/ujjalsharma100/agent-trace-viewer.git
   cd agent-trace-viewer
   ```

2. Run the installer:

   ```bash
   ./install.sh
   ```

   This will:
   - Check for Python 3.9+
   - Optionally build the frontend (if npm is installed)
   - Install the viewer to `~/.agent-trace/viewer/`
   - Create `~/.agent-trace/bin/agent-trace-viewer`
   - Optionally add `~/.agent-trace/bin` to your PATH

3. Ensure the CLI can find the viewer:

   ```bash
   export PATH="$HOME/.agent-trace/bin:$PATH"
   ```

   (Or restart your shell if the installer added it to your rc file.)

## Usage

1. From a project that has agent-trace initialized (or any directory):

   ```bash
   agent-trace viewer
   ```

   Or with an explicit project path:

   ```bash
   agent-trace viewer --project /path/to/your/repo
   ```

2. Open in your browser:

   ```
   http://127.0.0.1:8765
   ```

3. Use the sidebar to browse files; click a file to view its content. Git blame and agent-trace blame appear in the gutter/sidebar for the current line or segment.

## Uninstall

Remove the viewer and launcher:

```bash
rm -rf ~/.agent-trace/viewer
rm -f  ~/.agent-trace/bin/agent-trace-viewer
```

Optionally remove the PATH line from your shell rc file (e.g. `~/.zshrc` or `~/.bashrc`).

## Development

- **Backend (stdlib only):** `backend/main.py` and `backend/routes/`. Run from the viewer root:

  ```bash
  cd agent-trace-viewer
  python run_viewer.py /path/to/project
  ```

- **Frontend (Vite + React):** `frontend/`. Build and serve with API proxy:

  ```bash
  cd frontend
  npm install
  npm run dev    # dev server with proxy to backend :8765
  npm run build  # output in frontend/dist
  ```

With the backend running on port 8765, open the dev server (e.g. http://localhost:5173) or the backend (http://127.0.0.1:8765) after building.

## API (backend)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/project` | GET | Project root, storage mode, has_agent_trace |
| `/api/health` | GET | Health check |
| `/api/tree` | GET | `?path=...` — list dirs/files under path |
| `/api/file` | GET | `?path=...` — file content (404 if binary/not found) |
| `/api/git-blame` | GET | `?path=...` — git blame segments (start_line, end_line, author, commit_sha, etc.) |
| `/api/agent-trace-blame` | GET | `?path=...` — agent-trace blame (tier, model, tool, conversation) for file lines |
