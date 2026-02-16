#!/usr/bin/env bash
set -euo pipefail

# =========================================================================
# agent-trace-viewer installer
#
# Usage (curl from GitHub / monorepo):
#   curl -fsSL https://raw.githubusercontent.com/ujjalsharma100/agent-trace/main/agent-trace-viewer/install.sh | bash
#
# Usage (local — from repo checkout):
#   ./install.sh
#
# What it does:
#   1. If run via curl (no source on disk), downloads repo and re-runs from viewer dir
#   2. Checks for Python 3.9+
#   3. Copies backend + frontend (or built frontend) to ~/.agent-trace/viewer/
#   4. Creates ~/.agent-trace/bin/agent-trace-viewer launcher
#   5. Optionally adds ~/.agent-trace/bin to PATH
# =========================================================================

INSTALL_DIR="${HOME}/.agent-trace"
VIEWER_DIR="${INSTALL_DIR}/viewer"
GITHUB_REPO="${AGENT_TRACE_VIEWER_REPO:-https://github.com/ujjalsharma100/agent-trace}"
GITHUB_BRANCH="${AGENT_TRACE_INSTALL_BRANCH:-main}"
BIN_DIR="${INSTALL_DIR}/bin"

# -------------------------------------------------------------------
# Colours
# -------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}==>${NC} $1"; }
warn()  { echo -e "${YELLOW}Warning:${NC} $1"; }
error() { echo -e "${RED}Error:${NC} $1" >&2; exit 1; }

# -------------------------------------------------------------------
# 0.  Bootstrap: if run via curl (no source on disk), download and re-run
# -------------------------------------------------------------------
bootstrap_if_remote() {
    if [ -n "${AGENT_TRACE_VIEWER_INSTALL_FROM_GITHUB:-}" ]; then
        return
    fi

    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)" || true
    if [ -f "${script_dir}/backend/main.py" ] || [ -f "${script_dir}/agent-trace-viewer/backend/main.py" ]; then
        return
    fi

    info "No source tree found; downloading from GitHub ..."
    if ! command -v curl &>/dev/null; then
        error "curl is required. Install curl or clone the repo and run ./install.sh"
    fi

    local tmpdir tarball
    tmpdir="$(mktemp -d)"
    tarball="${tmpdir}/agent-trace.tar.gz"

    if ! curl -fsSL "${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.tar.gz" -o "$tarball"; then
        error "Failed to download. Check your network or try again."
    fi

    if ! tar xzf "$tarball" -C "$tmpdir"; then
        error "Failed to extract archive."
    fi

    local extract_dir="${tmpdir}/agent-trace-${GITHUB_BRANCH}"
    local viewer_path="${extract_dir}/agent-trace-viewer"
    if [ ! -f "${viewer_path}/install.sh" ]; then
        viewer_path="${extract_dir}"
        if [ ! -f "${viewer_path}/install.sh" ]; then
            error "Unexpected archive layout. Clone the repo and run ./install.sh from agent-trace-viewer/"
        fi
    fi

    export AGENT_TRACE_VIEWER_INSTALL_FROM_GITHUB=1
    exec bash "${viewer_path}/install.sh"
}

# -------------------------------------------------------------------
# 1.  Check Python 3.9+
# -------------------------------------------------------------------
check_python() {
    if ! command -v python3 &>/dev/null; then
        error "Python 3 is required but not found."
    fi

    local version
    version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    local major minor
    major="$(echo "$version" | cut -d. -f1)"
    minor="$(echo "$version" | cut -d. -f2)"

    if [ "$major" -lt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -lt 9 ]; }; then
        error "Python 3.9+ is required (found $version)."
    fi

    info "Found Python ${version}"
}

# -------------------------------------------------------------------
# 2.  Locate source
# -------------------------------------------------------------------
find_source() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

    if [ -f "${SCRIPT_DIR}/backend/main.py" ]; then
        SOURCE_DIR="${SCRIPT_DIR}"
    elif [ -f "${SCRIPT_DIR}/agent-trace-viewer/backend/main.py" ]; then
        SOURCE_DIR="${SCRIPT_DIR}/agent-trace-viewer"
    else
        error "Cannot find viewer source (backend/main.py). Run this script from agent-trace-viewer/"
    fi

    info "Source: ${SOURCE_DIR}"
}

# -------------------------------------------------------------------
# 3.  Build frontend (optional)
# -------------------------------------------------------------------
build_frontend() {
    if [ ! -f "${SOURCE_DIR}/frontend/package.json" ]; then
        return
    fi
    if command -v npm &>/dev/null; then
        info "Building frontend ..."
        (cd "${SOURCE_DIR}/frontend" && npm install && npm run build) || warn "Frontend build failed; viewer will use minimal fallback UI."
    else
        warn "npm not found; viewer will use minimal fallback UI. Install Node/npm and re-run to build the full UI."
    fi
}

# -------------------------------------------------------------------
# 4.  Install files
# -------------------------------------------------------------------
install_files() {
    info "Installing to ${VIEWER_DIR} ..."

    mkdir -p "${VIEWER_DIR}"
    mkdir -p "${BIN_DIR}"

    # Backend
    cp -r "${SOURCE_DIR}/backend" "${VIEWER_DIR}/"
    cp "${SOURCE_DIR}/run_viewer.py" "${VIEWER_DIR}/"

    # Frontend: copy source and, if built, dist
    if [ -d "${SOURCE_DIR}/frontend" ]; then
        mkdir -p "${VIEWER_DIR}/frontend"
        cp -r "${SOURCE_DIR}/frontend/src" "${VIEWER_DIR}/frontend/" 2>/dev/null || true
        cp "${SOURCE_DIR}/frontend/index.html" "${VIEWER_DIR}/frontend/" 2>/dev/null || true
        cp "${SOURCE_DIR}/frontend/package.json" "${VIEWER_DIR}/frontend/" 2>/dev/null || true
        if [ -d "${SOURCE_DIR}/frontend/dist" ]; then
            cp -r "${SOURCE_DIR}/frontend/dist" "${VIEWER_DIR}/frontend/"
        fi
    fi

    # Launcher
    cat > "${BIN_DIR}/agent-trace-viewer" << 'ENTRY_POINT'
#!/usr/bin/env python3
import os
import sys
VIEWER_DIR = os.path.expanduser(os.path.join("~", ".agent-trace", "viewer"))
os.chdir(VIEWER_DIR)
sys.path.insert(0, VIEWER_DIR)
from backend.main import main
main()
ENTRY_POINT

    chmod +x "${BIN_DIR}/agent-trace-viewer"
    info "Installed ${BIN_DIR}/agent-trace-viewer"
}

# -------------------------------------------------------------------
# 5.  Add to PATH (optional)
# -------------------------------------------------------------------
configure_path() {
    if echo "$PATH" | tr ':' '\n' | grep -qx "${BIN_DIR}"; then
        return
    fi

    local shell_name rc_file
    shell_name="$(basename "${SHELL:-/bin/bash}")"

    case "$shell_name" in
        zsh)   rc_file="${HOME}/.zshrc" ;;
        bash)
            [ "$(uname)" = "Darwin" ] && rc_file="${HOME}/.bash_profile" || rc_file="${HOME}/.bashrc"
            ;;
        fish)  rc_file="${HOME}/.config/fish/config.fish" ;;
        *)     rc_file="" ;;
    esac

    if [ -n "$rc_file" ] && [ -f "$rc_file" ] && ! grep -q '.agent-trace/bin' "$rc_file" 2>/dev/null; then
        echo "" >> "$rc_file"
        echo "# agent-trace" >> "$rc_file"
        [ "$shell_name" = "fish" ] && echo "set -gx PATH \$HOME/.agent-trace/bin \$PATH" >> "$rc_file" || echo 'export PATH="${HOME}/.agent-trace/bin:${PATH}"' >> "$rc_file"
        info "Added ${BIN_DIR} to PATH in ${rc_file}"
    fi
}

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------
main() {
    echo ""
    echo -e "  ${BOLD}agent-trace viewer installer${NC}"
    echo "  ==============================="
    echo ""

    bootstrap_if_remote
    check_python
    find_source
    build_frontend
    install_files
    configure_path

    echo ""
    info "Installation complete!"
    echo ""
    echo "  Run the viewer from a project directory:"
    echo "    agent-trace viewer"
    echo "  Or with an explicit project path:"
    echo "    agent-trace viewer --project /path/to/repo"
    echo ""
    echo "  Then open: http://127.0.0.1:8765"
    echo ""
}

main
