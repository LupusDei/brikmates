#!/bin/bash

# Setup script for BrikMate project
# Ensures correct Node.js version and installs dependencies

echo "🔧 Setting up BrikMate project environment..."

# Check if nvm is available
if ! command -v nvm &> /dev/null; then
    echo "❌ nvm is not installed. Please install nvm first:"
    echo "   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    exit 1
fi

# Use the correct Node.js version
echo "📦 Setting Node.js version to 20.19.6..."
nvm install 20.19.6
nvm use 20.19.6

# Verify Node version
NODE_VERSION=$(node --version)
if [[ "$NODE_VERSION" != "v20.19.6" ]]; then
    echo "❌ Failed to set correct Node.js version. Current: $NODE_VERSION"
    exit 1
fi

echo "✅ Node.js $NODE_VERSION is now active"

# Install dependencies for document-organizer
echo "📦 Installing dependencies..."
cd document-organizer
npm install

echo "🎉 Setup complete! You can now run:"
echo "   npm run dev    # Start development server"
echo "   npm run build  # Build for production"
echo "   npm run start  # Start production server"