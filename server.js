const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Create downloads directory
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

// Clean up old files (older than 1 hour)
const cleanupOldFiles = () => {
  const files = fs.readdirSync(DOWNLOADS_DIR);
  const now = Date.now();
  
  files.forEach(file => {
    const filePath = path.join(DOWNLOADS_DIR, file);
    const stats = fs.statSync(filePath);
    const fileAge = now - stats.mtimeMs;
    
    // Delete files older than 1 hour
    if (fileAge > 3600000) {
      fs.unlinkSync(filePath);
      console.log(`Deleted old file: ${file}`);
    }
  });
};

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, 1800000);

// Helper to extract video ID
const extractVideoId = (url) => {
  const match = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/);
  return match ? match[1] : null;
};

// Helper to format duration
const formatDuration = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Video Downloader API is running' });
});

// Get video info
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid YouTube URL. Please make sure it\'s a valid YouTube video link.' 
      });
    }

    const videoId = extractVideoId(url);
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Could not extract video ID from URL' 
      });
    }

    // Get video info
    const info = await ytdl.getInfo(url);
    
    // Get available formats
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    
    // Extract unique qualities
    const qualities = new Set();
    const qualityFormats = {};
    
    formats.forEach(format => {
      if (format.qualityLabel) {
        const quality = format.qualityLabel.replace('p60', 'p'); // Normalize 60fps
        qualities.add(quality);
        
        if (!qualityFormats[quality] || format.bitrate > qualityFormats[quality].bitrate) {
          qualityFormats[quality] = format;
        }
      }
    });

    // Sort qualities (1080p, 720p, 480p, 360p, etc.)
    const sortedQualities = Array.from(qualities).sort((a, b) => {
      const aNum = parseInt(a);
      const bNum = parseInt(b);
      return bNum - aNum;
    });

    // Build quality options
    const qualityOptions = sortedQualities.map(quality => ({
      quality: quality,
      format: 'mp4',
      url: `/api/download?videoId=${videoId}&quality=${quality}`,
      directDownload: true
    }));

    // Get video details
    const videoDetails = info.videoDetails;

    return res.json({
      success: true,
      platform: 'YouTube',
      title: videoDetails.title,
      thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url,
      duration: formatDuration(parseInt(videoDetails.lengthSeconds)),
      author: videoDetails.author.name,
      videoId: videoId,
      qualities: qualityOptions,
      note: 'Download will start automatically when you select a quality'
    });

  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.message.includes('unavailable')) {
      return res.status(404).json({ 
        success: false, 
        error: 'Video is unavailable. It may be private, deleted, or region-blocked.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch video information. Please try again.' 
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

    // Validate URL
    if (!ytdl.validateURL(videoUrl)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    console.log(`Starting download: ${videoId} at ${quality}`);

    // Get video info
    const info = await ytdl.getInfo(videoUrl);
    const videoTitle = info.videoDetails.title.replace(/[^\w\s-]/g, '').substring(0, 50);
    
    // Find the best format matching the quality
    let format;
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    
    // Try to find exact quality match
    format = formats.find(f => f.qualityLabel === quality);
    
    // If not found, get closest quality
    if (!format) {
      const qualityNum = parseInt(quality);
      format = formats
        .filter(f => f.qualityLabel)
        .sort((a, b) => {
          const aDiff = Math.abs(parseInt(a.qualityLabel) - qualityNum);
          const bDiff = Math.abs(parseInt(b.qualityLabel) - qualityNum);
          return aDiff - bDiff;
        })[0];
    }

    // If still no format, use highest quality
    if (!format) {
      format = ytdl.chooseFormat(formats, { quality: 'highest' });
    }

    console.log(`Selected format: ${format.qualityLabel || 'best available'}`);

    // Set headers for download
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);

    // Stream the video directly to response
    const videoStream = ytdl(videoUrl, { format });
    
    videoStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    });

    videoStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error.message);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Download failed. Please try again.',
        details: error.message 
      });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
  console.log(`✅ Using ytdl-core for reliable downloads`);
});

module.exports = app;
