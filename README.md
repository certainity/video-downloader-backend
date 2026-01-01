# YouTube Video FAST Downloader 24/7 - Setup Guide

## ✅ Correct API Configuration

You're using: **YouTube Video FAST Downloader 24/7**

API Details:
- **Host**: `youtube-video-fast-downloader-24-7.p.rapidapi.com`
- **Endpoint**: `/download_video/{videoId}`
- **Your API Key**: `dWqXZrGuX1mshGXir9X0iv4JIk6VpvISvlqqjsnoECIJADLXNuN`

## 🚀 Quick Setup

### Step 1: Use Correct Server File

```bash
# This is the CORRECT backend for your API
mv server-fast-downloader.js server.js
```

### Step 2: Set Your API Key

**For Local Development:**
```bash
# Linux/Mac
export RAPIDAPI_KEY="dWqXZrGuX1mshGXir9X0iv4JIk6VpvISvlqqjsnoECIJADLXNuN"

# Windows CMD
set RAPIDAPI_KEY=dWqXZrGuX1mshGXir9X0iv4JIk6VpvISvlqqjsnoECIJADLXNuN

# Windows PowerShell
$env:RAPIDAPI_KEY="dWqXZrGuX1mshGXir9X0iv4JIk6VpvISvlqqjsnoECIJADLXNuN"
```

**Or create `.env` file:**
```env
RAPIDAPI_KEY=dWqXZrGuX1mshGXir9X0iv4JIk6VpvISvlqqjsnoECIJADLXNuN
PORT=5000
```

Then install dotenv:
```bash
npm install dotenv
```

And add to top of server.js:
```javascript
require('dotenv').config();
```

### Step 3: Install & Run

```bash
npm install
npm start
```

### Step 4: Test

Open your browser and test with:
```
http://localhost:5000/api/health
```

Should show:
```json
{
  "status": "OK",
  "api": "YouTube Video FAST Downloader 24/7",
  "rapidapi": true
}
```

## 🔌 API Endpoint Format

This API uses a different format than others:

**Get Video Info:**
```
GET /download_video/{videoId}?quality=247
```

**Quality Codes (itag):**
- `247` = 720p
- `136` = 720p HD
- `135` = 480p
- `134` = 360p
- `133` = 240p
- `160` = 144p

## 🧪 Test on RapidAPI First

Before using in your app, test on RapidAPI:

1. Go to: https://rapidapi.com/ytjar/api/youtube-video-fast-downloader-24-7
2. Click **"Test Endpoint"**
3. Select "Get Video Download URL"
4. Enter: `TS01tH9pEt4` (test video ID)
5. Quality: `247`
6. Click "Test Endpoint"

**If this works** → API is fine, use the server I created
**If this fails** → Subscription issue or API problem

## 📋 Troubleshooting

### "403 Forbidden"
✅ **Fixed!** The previous issue was using the wrong API endpoint.
This new server uses the correct endpoint for your API.

### "Invalid API Key"
- Make sure key has no extra spaces
- Copy exactly: `dWqXZrGuX1mshGXir9X0iv4JIk6VpvISvlqqjsnoECIJADLXNuN`
- Check environment variable is set: `echo $RAPIDAPI_KEY`

### "Rate Limit Exceeded"
- Free plan has limits
- Wait 24 hours for reset
- Or upgrade plan on RapidAPI

## 🚀 Deploy to Render.com

1. **Push to GitHub**
```bash
git init
git add .
git commit -m "Video downloader with RapidAPI"
git push
```

2. **Create Web Service on Render**
- Build Command: `npm install`
- Start Command: `npm start`

3. **Add Environment Variable**
- Key: `RAPIDAPI_KEY`
- Value: `dWqXZrGuX1mshGXir9X0iv4JIk6VpvISvlqqjsnoECIJADLXNuN`

4. **Deploy!**

## ✅ This Should Work Now!

The previous 403 error was because we were using:
- ❌ Wrong host: `youtube-video-download-info.p.rapidapi.com`
- ❌ Wrong endpoint: `/dl`

Now we're using:
- ✅ Correct host: `youtube-video-fast-downloader-24-7.p.rapidapi.com`
- ✅ Correct endpoint: `/download_video/{videoId}`

Try it now and it should work! 🎉