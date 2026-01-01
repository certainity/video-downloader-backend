const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// RapidAPI Configuration
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'YOUR_RAPIDAPI_KEY_HERE';
const RAPIDAPI_HOST = 'youtube-video-download-info.p.rapidapi.com';

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

// Format duration from seconds to MM:SS
const formatDuration = (seconds) => {
  if (!seconds) return 'Available';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Video Downloader API is running',
    rapidapi: RAPIDAPI_KEY !== 'YOUR_RAPIDAPI_KEY_HERE',
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

    // Check if API key is set
    if (RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY_HERE') {
      return res.status(500).json({
        success: false,
        error: 'RapidAPI key not configured. Please set RAPIDAPI_KEY environment variable.',
        setup: 'Get your free API key from https://rapidapi.com/ytjar/api/youtube-video-download-info'
      });
    }

    // Call RapidAPI
    const options = {
      method: 'GET',
      url: 'https://youtube-video-download-info.p.rapidapi.com/dl',
      params: { id: videoId },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      timeout: 15000
    };

    const response = await axios.request(options);
    const data = response.data;

    console.log('RapidAPI Response:', JSON.stringify(data, null, 2));

    if (!data || data.status !== 'ok') {
      throw new Error('Failed to fetch video info from RapidAPI');
    }

    // Extract video information
    const videoInfo = data;
    const title = videoInfo.title || 'YouTube Video';
    const thumbnail = videoInfo.thumb || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const author = videoInfo.author || 'YouTube Channel';
    const duration = videoInfo.duration || 0;

    // Extract download links
    const qualities = [];
    
    if (videoInfo.link) {
      // Format can be: mp4, 360, 480, 720, 1080, etc.
      const formats = videoInfo.link;
      
      // Add available qualities
      const qualityPriority = ['1080', '720', '480', '360', '240', '144'];
      
      qualityPriority.forEach(quality => {
        if (formats[quality]) {
          qualities.push({
            quality: `${quality}p`,
            format: 'mp4',
            url: formats[quality][0] || formats[quality],
            directDownload: true,
            external: true
          });
        }
      });

      // Also check for 'mp4' format
      if (formats.mp4 && qualities.length === 0) {
        qualities.push({
          quality: 'Best',
          format: 'mp4',
          url: Array.isArray(formats.mp4) ? formats.mp4[0] : formats.mp4,
          directDownload: true,
          external: true
        });
      }
    }

    // If no qualities found, return error
    if (qualities.length === 0) {
      return res.json({
        success: false,
        error: 'No downloadable formats available for this video'
      });
    }

    console.log(`Successfully fetched: ${title} with ${qualities.length} qualities`);

    return res.json({
      success: true,
      platform: 'YouTube',
      title: title,
      thumbnail: thumbnail,
      duration: formatDuration(duration),
      author: author,
      videoId: videoId,
      qualities: qualities,
      note: 'Direct download links from RapidAPI'
    });

  } catch (error) {
    console.error('Error fetching video info:', error.message);
    
    if (error.response) {
      console.error('RapidAPI Error Response:', error.response.data);
      
      if (error.response.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'API rate limit exceeded. Please try again later or upgrade your RapidAPI plan.',
          upgrade: 'Visit https://rapidapi.com to upgrade your plan'
        });
      }
      
      if (error.response.status === 403) {
        return res.status(403).json({
          success: false,
          error: 'Invalid API key. Please check your RapidAPI key configuration.',
          setup: 'Get your API key from https://rapidapi.com/ytjar/api/youtube-video-download-info'
        });
      }
    }

    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch video information. Please try again.',
      details: error.message
    });
  }
});

// Download endpoint - redirect to direct link
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, quality, url } = req.query;

    // If direct URL is provided, redirect to it
    if (url) {
      console.log(`Redirecting to download URL for quality: ${quality}`);
      return res.redirect(url);
    }

    // Otherwise, fetch the video info again
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID or URL required' });
    }

    console.log(`Fetching download link for: ${videoId} at ${quality}`);

    if (RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY_HERE') {
      return res.status(500).json({
        error: 'RapidAPI key not configured'
      });
    }

    const options = {
      method: 'GET',
      url: 'https://youtube-video-download-info.p.rapidapi.com/dl',
      params: { id: videoId },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      timeout: 15000
    };

    const response = await axios.request(options);
    const data = response.data;

    if (!data || data.status !== 'ok' || !data.link) {
      throw new Error('Failed to get download link');
    }

    // Get the requested quality
    const qualityNum = quality ? quality.replace('p', '') : '720';
    const formats = data.link;
    
    let downloadUrl = null;
    
    if (formats[qualityNum]) {
      downloadUrl = Array.isArray(formats[qualityNum]) ? formats[qualityNum][0] : formats[qualityNum];
    } else if (formats.mp4) {
      downloadUrl = Array.isArray(formats.mp4) ? formats.mp4[0] : formats.mp4;
    }

    if (!downloadUrl) {
      return res.status(404).json({ error: 'Download link not available' });
    }

    console.log('Redirecting to:', downloadUrl);
    res.redirect(downloadUrl);

  } catch (error) {
    console.error('Download error:', error.message);
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed. Please try again.' });
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
  console.log(`🔑 RapidAPI Key: ${RAPIDAPI_KEY !== 'YOUR_RAPIDAPI_KEY_HERE' ? 'Configured ✅' : 'Not configured ❌'}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY_HERE') {
    console.log('\n⚠️  WARNING: RapidAPI key not configured!');
    console.log('Get your free API key from: https://rapidapi.com/ytjar/api/youtube-video-download-info');
    console.log('Then set it as environment variable: RAPIDAPI_KEY=your_key_here\n');
  }
});

module.exports = app;