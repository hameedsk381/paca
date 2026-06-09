#!/usr/bin/env bash
# Paca Claude Code Skill Installer
# Installs /paca and related slash commands into ~/.claude/commands/
# so they are available in every Claude Code session.
#
# Skills are stored in skills/<name>/SKILL.md (Agent Skills format).
# This script strips the YAML frontmatter and writes the body to
# ~/.claude/commands/<name>.md for use as Claude Code slash commands.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Paca-AI/paca/master/scripts/install-claude-skill.sh | bash
#   OR (from a local clone):
#   bash scripts/install-claude-skill.sh

set -euo pipefail

REPO="Paca-AI/paca"
BRANCH="master"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/skills"
DEST_DIR="${HOME}/.claude/commands"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[paca]${NC} $*"; }
success() { echo -e "${GREEN}[paca]${NC} $*"; }
warn()    { echo -e "${YELLOW}[paca]${NC} $*"; }

echo ""
echo "  🦙 Paca Claude Code Skill Installer"
echo "  ────────────────────────────────────"
echo ""

# Detect if running from a local clone (the script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
LOCAL_SKILLS=""
if [[ -n "${SCRIPT_DIR}" && -d "${SCRIPT_DIR}/../skills" ]]; then
  LOCAL_SKILLS="${SCRIPT_DIR}/../skills"
  info "Local clone detected — installing from ${LOCAL_SKILLS}"
else
  info "Installing from GitHub (${REPO}@${BRANCH})"
  # Check for curl or wget
  if ! command -v curl &>/dev/null && ! command -v wget &>/dev/null; then
    echo "Error: curl or wget is required. Install one and re-run." >&2
    exit 1
  fi
fi

# Create destination directory
mkdir -p "${DEST_DIR}"
info "Installing skills to: ${DEST_DIR}"
echo ""

# Strip YAML frontmatter (---...---) from a SKILL.md file
strip_frontmatter() {
  awk 'NR==1 && /^---$/{skip=1; next} skip && /^---$/{skip=0; next} !skip' "$1"
}

install_skill() {
  local name="$1"
  local dest="${DEST_DIR}/${name}.md"

  if [[ -n "${LOCAL_SKILLS}" ]]; then
    strip_frontmatter "${LOCAL_SKILLS}/${name}/SKILL.md" > "${dest}"
  else
    local tmp
    tmp=$(mktemp)
    if command -v curl &>/dev/null; then
      curl -fsSL "${BASE_URL}/${name}/SKILL.md" -o "${tmp}"
    else
      wget -qO "${tmp}" "${BASE_URL}/${name}/SKILL.md"
    fi
    strip_frontmatter "${tmp}" > "${dest}"
    rm -f "${tmp}"
  fi

  success "Installed: ~/.claude/commands/${name}.md"
}

install_skill "paca"
install_skill "paca-setup"
install_skill "paca-epic"
install_skill "paca-clarify"
install_skill "paca-breakdown"
install_skill "paca-sprint"
install_skill "paca-estimate"
install_skill "paca-prioritize"
install_skill "paca-do"
install_skill "paca-test"
install_skill "paca-doc"

echo ""
success "Installation complete!"
echo ""
echo "  Available commands in Claude Code:"
echo "  ┌─────────────────────────────────────────────────────────────────────┐"
echo "  │  /paca <request>    — General Paca task/doc/sprint operations        │"
echo "  │  /paca-setup        — Configure the Paca MCP server connection       │"
echo "  │  /paca-epic         — Create an epic from requirements               │"
echo "  │  /paca-clarify      — Clarify and improve a task or spec             │"
echo "  │  /paca-breakdown    — Break a task into sub-tasks                    │"
echo "  │  /paca-sprint       — Plan a sprint from the backlog                 │"
echo "  │  /paca-estimate     — Estimate story points for tasks                │"
echo "  │  /paca-prioritize   — Set priorities across the backlog              │"
echo "  │  /paca-do           — Execute a task and update its status           │"
echo "  │  /paca-test         — Test a task and record results                 │"
echo "  │  /paca-doc          — Write or update documentation in Paca Docs     │"
echo "  └─────────────────────────────────────────────────────────────────────┘"
echo ""
echo "  Next step: configure the Paca MCP server."
echo "  In a Claude Code session, run:  /paca-setup"
echo ""
echo "  Or add the MCP server manually:"
echo ""
echo "    claude mcp add paca \\"
echo "      --env PACA_API_KEY=<your-api-key> \\"
echo "      --env PACA_API_URL=<your-paca-url> \\"
echo "      -- npx -y @paca-ai/paca-mcp"
echo ""
echo "  Docs: https://github.com/${REPO}/blob/${BRANCH}/docs/guides/claude-code-skill.md"
echo ""
