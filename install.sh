#!/bin/bash
set -e

REPO_URL="https://github.com/daksh-maheshwari-ai-enggr/Todex.git"
INSTALL_DIR="$HOME/.todex"

echo "🚀 Installing Todex..."

# Check Node.js and npm
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
  echo "❌ Error: Node.js and npm are required."
  echo "Install Node.js from https://nodejs.org/"
  exit 1
fi

# Check Git
if ! command -v git &> /dev/null; then
  echo "❌ Error: Git is required."
  echo "Install Git from https://git-scm.com/downloads"
  exit 1
fi

echo "✓ Node.js: $(node --version)"
echo "✓ npm: $(npm --version)"

# Clone or update Todex
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "📦 Updating Todex..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "📥 Downloading Todex..."

  # Remove incomplete previous installation
  rm -rf "$INSTALL_DIR"

  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Install root dependencies
echo "📦 Installing dependencies..."
npm install

# Install CLI/TUI dependencies
if [ -d "cli" ]; then
  echo "📦 Installing TUI dependencies..."
  cd cli
  npm install
  cd ..
fi

# Build Todex
echo "🔨 Building Todex..."
npm run build

# Make Todex globally available
echo "🔗 Linking Todex..."
npm link

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Todex installed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Run Todex from any project:"
echo ""
echo "  cd /path/to/your/project"
echo "  todex"
echo ""
echo "Todex will use the current directory as the workspace."
echo ""
echo "Installation: $INSTALL_DIR"
echo ""