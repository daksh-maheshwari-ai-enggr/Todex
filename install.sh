#!/bin/bash
set -e

# Check if npm is installed
if ! command -v npm &> /dev/null; then
  echo "Error: npm is not installed. Please install Node.js and npm first."
  echo "Download Node.js from https://nodejs.org/"
  exit 1
fi

# Check if git is installed
if ! command -v git &> /dev/null; then
  echo "Error: git is not installed. Please install git first."
  echo "Download git from https://git-scm.com/downloads"
  exit 1
fi

# Check if current directory is a git repository
if [ -d ".git" ]; then
  echo "You're already in a Toodex repository. Skipping clone."
else
  # Clone the repository
  REPO_URL="https://github.com/yourusername/todex.git"
  REPO_DIR="todex"

  # Create directory if it doesn't exist
  if [ ! -d "$REPO_DIR" ]; then
    echo "Cloning repository..."
    git clone "$REPO_URL" "$REPO_DIR" || {
      echo "Error: Failed to clone repository."
      exit 1
    }
  fi
fi

# Change to the repository directory (skip when already inside the checkout)
if [ ! -d ".git" ]; then
  cd "$REPO_DIR" || {
    echo "Error: Failed to enter repository directory."
    exit 1
  }
fi

# Install dependencies
echo "Installing dependencies..."
npm install || {
  echo "Error: Failed to install dependencies."
  exit 1
}

# Install TUI dependencies (the root build compiles the cli package too)
echo "Installing TUI dependencies..."
(cd cli && npm install) || {
  echo "Error: Failed to install cli dependencies."
  exit 1
}

# Build the project
echo "Building project..."
npm run build || {
  echo "Error: Failed to build project."
  exit 1
}

# Link the package globally
echo "Linking package globally..."
npm link || {
  echo "Error: Failed to link package globally."
  echo "You can manually link it with: npm link"
}

# Display success message
echo "Toodex installed successfully!"
echo "You can now run: todex"
echo "To run in development mode: cd $REPO_DIR && npm run dev"
echo "To install via cURL: curl -fsSL https://raw.githubusercontent.com/yourusername/todex/main/install.sh | bash"