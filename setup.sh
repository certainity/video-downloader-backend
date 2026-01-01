#!/bin/bash

echo "🚀 Setting up Video Downloader Backend..."

# Install yt-dlp (most reliable YouTube downloader)
echo "📦 Installing yt-dlp..."

# For Ubuntu/Debian
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip ffmpeg
    sudo pip3 install -U yt-dlp
    echo "✅ yt-dlp installed via pip"
fi

# For macOS
if command -v brew &> /dev/null; then
    brew install yt-dlp ffmpeg
    echo "✅ yt-dlp installed via brew"
fi

# Fallback: Install via pip
if ! command -v yt-dlp &> /dev/null; then
    pip3 install -U yt-dlp
    echo "✅ yt-dlp installed via pip"
fi

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm install

echo "✅ Setup complete!"
echo ""
echo "To start the server:"
echo "  npm start"
echo ""
echo "To test:"
echo "  curl http://localhost:5000/api/health"