const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const execPromise = promisify(exec);
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Create downloads directory
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Clean up old files periodically
const cleanupOldFiles = () => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    const now = Date.now();
    
    files.forEach(file => {
      const filePath = path.join(DOWNLOADS_DIR, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtimeMs;
      
      // Delete files older than 1 hour
      if (fileAge > 3600000) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up old file: ${file}`);
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error.message);
  }
};

setInterval(cleanupOldFiles, 1800000); // Every 30 minutes

// Helper to extract video ID
const extractVideoId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Check if yt-dlp is installed
const checkYtDlp = async () => {
  try {
    await execPromise('yt-dlp --version');
    console.log('✅ yt-dlp is installed');
    return true;
  } catch (error) {
    console.log('⚠️  yt-dlp not found, will use API fallback');
    return false;
  }
};

let ytDlpAvailable = false;

// Health check
app.get('/api/health', async (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Video Downloader API is running',
    ytdlp: ytDlpAvailable,
    timestamp: new Date().toISOString()
  });
});

// Get video info
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const videoId = extractVideoId(url);
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid YouTube URL' 
      });
    }

    console.log(`Fetching info for: ${videoId}`);

    // Method 1: Try using yt-dlp if available
    if (ytDlpAvailable) {
      try {
        const { stdout } = await execPromise(
          `yt-dlp --dump-json "https://www.youtube.com/watch?v=${videoId}"`,
          { timeout: 15000 }
        );
        
        const info = JSON.parse(stdout);
        
        // Extract available formats
        const formats = info.formats
          .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
          .filter(f => f.height)
          .sort((a, b) => b.height - a.height);

        const uniqueQualities = [...new Set(formats.map(f => `${f.height}p`))];
        
        const qualities = uniqueQualities.map(quality => ({
          quality,
          format: 'mp4',
          url: `/api/download?videoId=${videoId}&quality=${quality}`,
          directDownload: true
        }));

        return res.json({
          success: true,
          platform: 'YouTube',
          title: info.title,
          thumbnail: info.thumbnail,
          duration: formatDuration(info.duration),
          author: info.uploader || info.channel,
          videoId: videoId,
          qualities: qualities.length > 0 ? qualities : getDefaultQualities(videoId),
          note: 'Server-side download using yt-dlp'
        });

      } catch (error) {
        console.error('yt-dlp failed:', error.message);
      }
    }

    // Method 2: Use YouTube oEmbed API
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const response = await axios.get(oembedUrl, { timeout: 10000 });
      const data = response.data;

      return res.json({
        success: true,
        platform: 'YouTube',
        title: data.title,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: data.author_name,
        videoId: videoId,
        qualities: getDefaultQualities(videoId),
        note: 'Click quality to download'
      });

    } catch (error) {
      console.error('oEmbed failed:', error.message);
      
      // Fallback
      return res.json({
        success: true,
        platform: 'YouTube',
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: 'YouTube Channel',
        videoId: videoId,
        qualities: getDefaultQualities(videoId),
        note: 'Video detected, click to download'
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch video information' 
    });
  }
});

// Download video
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, quality } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Starting download: ${videoId} at ${quality}`);

    // Method 1: Try yt-dlp
    if (ytDlpAvailable) {
      try {
        const qualityHeight = quality ? quality.replace('p', '') : '720';
        const outputTemplate = path.join(DOWNLOADS_DIR, `${videoId}_%(height)sp.%(ext)s`);
        
        const command = `yt-dlp -f "bestvideo[height<=${qualityHeight}]+bestaudio/best[height<=${qualityHeight}]" --merge-output-format mp4 -o "${outputTemplate}" "${videoUrl}"`;
        
        console.log('Executing:', command);
        const { stdout, stderr } = await execPromise(command, { timeout: 120000 });
        
        console.log('Download complete:', stdout);
        
        // Find the downloaded file
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(videoId));
        
        if (files.length > 0) {
          const filePath = path.join(DOWNLOADS_DIR, files[0]);
          const stat = fs.statSync(filePath);
          
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Content-Disposition', `attachment; filename="video_${quality}.mp4"`);
          
          const stream = fs.createReadStream(filePath);
          stream.pipe(res);
          
          stream.on('end', () => {
            // Delete file after streaming
            setTimeout(() => {
              try {
                fs.unlinkSync(filePath);
              } catch (e) {
                console.error('Failed to delete file:', e.message);
              }
            }, 5000);
          });
          
          return;
        }
      } catch (error) {
        console.error('yt-dlp download failed:', error.message);
      }
    }

    // Method 2: Try using third-party API as fallback
    try {
      const apiResponse = await axios.post(
        'https://api.vevioz.com/api/button/videos',
        {
          url: videoUrl
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000
        }
      );

      if (apiResponse.data && apiResponse.data.video && apiResponse.data.video.length > 0) {
        // Find matching quality
        const videos = apiResponse.data.video;
        let selectedVideo = videos.find(v => v.quality === quality);
        
        if (!selectedVideo) {
          selectedVideo = videos[0]; // Fallback to first available
        }

        if (selectedVideo && selectedVideo.url) {
          return res.redirect(selectedVideo.url);
        }
      }
    } catch (error) {
      console.error('API fallback failed:', error.message);
    }

    // If everything fails
    res.status(503).json({ 
      error: 'Download service temporarily unavailable. Please try again in a moment.',
      suggestion: 'The server might be processing other requests. Please wait and retry.'
    });

  } catch (error) {
    console.error('Download error:', error.message);
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed' });
    }
  }
});

// Helper functions
const formatDuration = (seconds) => {
  if (!seconds) return 'Available';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getDefaultQualities = (videoId) => {
  return [
    { 
      quality: '1080p', 
      format: 'mp4',
      url: `/api/download?videoId=${videoId}&quality=1080p`,
      directDownload: true
    },
    { 
      quality: '720p', 
      format: 'mp4',
      url: `/api/download?videoId=${videoId}&quality=720p`,
      directDownload: true
    },
    { 
      quality: '480p', 
      format: 'mp4',
      url: `/api/download?videoId=${videoId}&quality=480p`,
      directDownload: true
    },
    { 
      quality: '360p', 
      format: 'mp4',
      url: `/api/download?videoId=${videoId}&quality=360p`,
      directDownload: true
    }
  ];
};

// Initialize
const init = async () => {
  ytDlpAvailable = await checkYtDlp();
  
  app.listen(PORT, () => {
    console.log(`🚀 Video Downloader API running on port ${PORT}`);
    console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
    console.log(`✅ yt-dlp: ${ytDlpAvailable ? 'Available' : 'Not available (using API fallback)'}`);
  });
};

init();

module.exports = app;