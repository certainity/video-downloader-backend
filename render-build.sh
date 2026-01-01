#!/bin/bash

# Render.com build script for yt-dlp installation

echo "🔧 Installing system dependencies..."

# Update package list
apt-get update

# Install Python and pip
apt-get install -y python3 python3-pip ffmpeg

# Install yt-dlp
pip3 install -U yt-dlp

# Verify installation
yt-dlp --version

echo "✅ yt-dlp installed successfully"

# Install Node dependencies
npm install

echo "✅ Build complete!"