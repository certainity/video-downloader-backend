const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Format duration
const formatDuration = (seconds) => {
  if (!seconds) return 'Available';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Video Downloader API is running',
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
        error: 'Invalid YouTube URL. Please enter a valid YouTube video link.' 
      });
    }

    console.log(`Fetching info for video: ${videoId}`);

    // Validate URL
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    if (!ytdl.validateURL(videoUrl)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid YouTube URL' 
      });
    }

    // Get video info
    const info = await ytdl.getInfo(videoUrl);
    const videoDetails = info.videoDetails;

    // Get formats with both video and audio
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    
    // Extract unique qualities
    const qualityMap = new Map();
    
    formats.forEach(format => {
      if (format.qualityLabel) {
        const quality = format.qualityLabel;
        const height = parseInt(quality);
        
        if (!qualityMap.has(quality) || format.bitrate > qualityMap.get(quality).bitrate) {
          qualityMap.set(quality, {
            quality: quality,
            itag: format.itag,
            bitrate: format.bitrate,
            height: height
          });
        }
      }
    });

    // Convert to array and sort by height (highest first)
    let qualities = Array.from(qualityMap.values())
      .sort((a, b) => b.height - a.height)
      .map(q => ({
        quality: q.quality,
        format: 'mp4',
        url: `/api/download?videoId=${videoId}&itag=${q.itag}`,
        directDownload: true
      }));

    // If no qualities found, provide defaults
    if (qualities.length === 0) {
      qualities = [
        { 
          quality: '720p', 
          format: 'mp4',
          url: `/api/download?videoId=${videoId}&quality=highest`,
          directDownload: true
        },
        { 
          quality: '480p', 
          format: 'mp4',
          url: `/api/download?videoId=${videoId}&quality=medium`,
          directDownload: true
        },
        { 
          quality: '360p', 
          format: 'mp4',
          url: `/api/download?videoId=${videoId}&quality=lowest`,
          directDownload: true
        }
      ];
    }

    console.log(`Successfully fetched: ${videoDetails.title}`);

    return res.json({
      success: true,
      platform: 'YouTube',
      title: videoDetails.title,
      thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1]?.url || 
                 `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: formatDuration(parseInt(videoDetails.lengthSeconds)),
      author: videoDetails.author?.name || videoDetails.ownerChannelName || 'YouTube Channel',
      videoId: videoId,
      qualities: qualities,
      note: 'Direct download from server'
    });

  } catch (error) {
    console.error('Error fetching video info:', error.message);
    
    // Check if it's an availability error
    if (error.message.includes('unavailable')) {
      return res.status(404).json({ 
        success: false, 
        error: 'Video is unavailable. It may be private, deleted, or region-blocked.' 
      });
    }
    
    if (error.message.includes('Sign in')) {
      return res.status(403).json({ 
        success: false, 
        error: 'This video requires authentication. Age-restricted videos are not supported.' 
      });
    }

    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch video information. Please try again.' 
    });
  }
});

// Download video
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, itag, quality } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`Starting download: ${videoId}`);

    // Validate URL
    if (!ytdl.validateURL(videoUrl)) {
      return res.status(400).json({ error: 'Invalid video URL' });
    }

    // Get video info to get title
    const info = await ytdl.getInfo(videoUrl);
    const title = info.videoDetails.title.replace(/[^\w\s-]/g, '').substring(0, 50);

    // Determine format options
    let formatOptions = {};
    
    if (itag) {
      formatOptions = { quality: itag };
    } else if (quality === 'highest') {
      formatOptions = { quality: 'highestvideo' };
    } else if (quality === 'medium') {
      formatOptions = { quality: 'medium' };
    } else if (quality === 'lowest') {
      formatOptions = { quality: 'lowestvideo' };
    } else {
      formatOptions = { quality: 'highest' };
    }

    // Set response headers for download
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${title}.mp4"`);

    console.log(`Streaming video: ${title}`);

    // Create video stream
    const videoStream = ytdl(videoUrl, {
      ...formatOptions,
      filter: 'videoandaudio'
    });

    // Handle stream errors
    videoStream.on('error', (error) => {
      console.error('Stream error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed. Please try again.' });
      }
    });

    // Log progress
    videoStream.on('progress', (chunkLength, downloaded, total) => {
      const percent = (downloaded / total * 100).toFixed(1);
      console.log(`Download progress: ${percent}%`);
    });

    videoStream.on('end', () => {
      console.log('Download completed successfully');
    });

    // Pipe video to response
    videoStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error.message);
    
    if (!res.headersSent) {
      if (error.message.includes('unavailable')) {
        res.status(404).json({ error: 'Video unavailable' });
      } else if (error.message.includes('No such format')) {
        res.status(400).json({ error: 'Requested quality not available' });
      } else {
        res.status(500).json({ error: 'Download failed. Please try again.' });
      }
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  if (!res.headersSent) {
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
  console.log(`✅ Using ytdl-core v${require('ytdl-core/package.json').version}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;