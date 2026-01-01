# video-downloader-backend
Backend API for video downloader
# Video Downloader Backend - Fixed Version

## 🔧 What Was Fixed

The original code used **Cobalt API v7** which was shut down on November 11, 2024. This updated version uses **working alternatives**:

1. **yt5s.io API** (Primary)
2. **Y2Mate API** (Fallback #1)
3. **Loader.to API** (Fallback #2)

## 🚀 Features

- ✅ Multiple download services with automatic fallback
- ✅ Supports YouTube video downloads
- ✅ Multiple quality options (1080p, 720p, 480p, 360p)
- ✅ Platform detection (YouTube, Instagram, TikTok, Facebook)
- ✅ Automatic video info extraction
- ✅ CORS enabled for frontend integration
- ✅ Error handling and retry logic

## 📦 Installation

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Or run in production mode
npm start
```

The server will start on `http://localhost:5000`

### Deploy to Render.com

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Video downloader backend"
   git branch -M main
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Create Web Service on Render:**
   - Go to https://render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: video-downloader-backend
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: Free

3. **Update Frontend API URL:**
   After deployment, copy your Render URL and update in your React frontend:
   ```javascript
   const API_URL = 'https://your-app-name.onrender.com';
   ```

## 🔌 API Endpoints

### 1. Health Check
```
GET /api/health
```
**Response:**
```json
{
  "status": "OK",
  "message": "Video Downloader API is running"
}
```

### 2. Get Video Info
```
POST /api/video-info
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "success": true,
  "platform": "YouTube",
  "title": "Video Title",
  "thumbnail": "https://...",
  "author": "Channel Name",
  "duration": "Available",
  "videoId": "VIDEO_ID",
  "qualities": [
    {
      "quality": "1080p",
      "format": "mp4",
      "url": "/api/download?videoId=VIDEO_ID&quality=1080",
      "directDownload": true
    }
  ]
}
```

### 3. Download Video
```
GET /api/download?videoId=VIDEO_ID&quality=1080
```

**Response:**
- Redirects to actual download URL
- Or returns error if all services fail

## 🛠️ How It Works

1. **Frontend** sends video URL to `/api/video-info`
2. **Backend** extracts video ID and gets metadata
3. **Frontend** displays video info and quality options
4. User clicks quality button
5. **Backend** tries multiple services in order:
   - First tries **yt5s.io**
   - If fails, tries **Y2Mate**
   - If fails, tries **Loader.to**
6. **Backend** redirects to actual download URL

## ⚠️ Important Notes

### First Request Delay
When deployed on Render.com (free tier), the first request may take **30-50 seconds** because the server needs to wake up from sleep. This is normal behavior for free tier services.

### Rate Limiting
- The free download APIs may have rate limits
- If one service fails, the backend automatically tries the next one
- Users can manually visit yt5s.io or y2mate.com as backup

### Supported Platforms
Currently **fully working**:
- ✅ YouTube

**Partially supported** (detection only):
- ⚠️ Instagram
- ⚠️ TikTok
- ⚠️ Facebook
- ⚠️ Twitter/X

To add full support for other platforms, you'll need to integrate their specific APIs or use yt-dlp.

## 🔮 Future Improvements

1. **Add yt-dlp integration** for better quality and more platforms
2. **Implement caching** to speed up repeated requests
3. **Add Redis queue** for handling multiple downloads
4. **User authentication** and download history
5. **Premium features** with direct server-side downloads

## 📝 Testing

Test the backend directly:

```bash
# Health check
curl http://localhost:5000/api/health

# Get video info
curl -X POST http://localhost:5000/api/video-info \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Test download
curl "http://localhost:5000/api/download?videoId=dQw4w9WgXcQ&quality=720"
```

## 🐛 Troubleshooting

### "Failed to generate download link"
- The download services might be temporarily down
- Try again in a few moments
- Check if the video is available in your region

### "All download services are currently unavailable"
- All three APIs are down (rare)
- Suggest user to visit yt5s.io or y2mate.com manually
- Consider adding more backup services

### Video downloads but won't play
- Some browsers block cross-origin downloads
- Try opening the download link in a new tab
- Use the frontend's download button instead

## 📄 License

MIT License - Feel free to use and modify!

## 👨‍💻 Author

Ahmed - Full Stack Developer

---

**Note:** This tool is for personal use only. Respect copyright laws and only download content you have permission to use.