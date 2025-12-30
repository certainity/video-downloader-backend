const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to extract video ID
const extractVideoId = (url) => {
  const match = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/);
  return match ? match[1] : null;
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Video Downloader API is running' });
});

// Get video info using Cobalt API
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Extract video ID for thumbnail
    const videoId = extractVideoId(url);
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid YouTube URL. Please use a valid YouTube link.' 
      });
    }

    // Call Cobalt API for download links
    const cobaltResponse = await axios.post('https://api.cobalt.tools/api/json', {
      url: url,
      vCodec: 'h264',
      vQuality: '1080',
      aFormat: 'mp3',
      isAudioOnly: false,
      isNoTTWatermark: true
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000 // 30 second timeout
    });

    const data = cobaltResponse.data;

    if (data.status === 'redirect' || data.status === 'tunnel') {
      // Success - we have download URL
      const downloadUrl = data.url;

      res.json({
        success: true,
        platform: 'YouTube',
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: 'YouTube Channel',
        qualities: [
          {
            quality: '1080p',
            format: 'mp4',
            url: downloadUrl,
          },
          {
            quality: '720p',
            format: 'mp4',
            url: downloadUrl,
          },
          {
            quality: '480p',
            format: 'mp4',
            url: downloadUrl,
          },
          {
            quality: '360p',
            format: 'mp4',
            url: downloadUrl,
          }
        ],
        downloadUrl: downloadUrl
      });
    } else if (data.status === 'picker') {
      // Multiple qualities available
      res.json({
        success: true,
        platform: 'YouTube',
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: 'YouTube Channel',
        qualities: data.picker.map((item, index) => ({
          quality: ['1080p', '720p', '480p', '360p'][index] || 'HD',
          format: 'mp4',
          url: item.url,
        })),
        downloadUrl: data.picker[0].url
      });
    } else {
      // Error from Cobalt
      res.status(400).json({ 
        success: false, 
        error: data.text || 'Failed to process video. Please try another URL.' 
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
    
    // If Cobalt fails, use fallback method
    const videoId = extractVideoId(req.body.url);
    
    if (videoId) {
      res.json({
        success: true,
        platform: 'YouTube',
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: 'YouTube Channel',
        qualities: [
          {
            quality: '1080p',
            format: 'mp4',
            url: `https://www.y2mate.com/youtube/${videoId}`,
            fallback: true
          },
          {
            quality: '720p',
            format: 'mp4',
            url: `https://www.y2mate.com/youtube/${videoId}`,
            fallback: true
          },
          {
            quality: '480p',
            format: 'mp4',
            url: `https://www.y2mate.com/youtube/${videoId}`,
            fallback: true
          },
          {
            quality: '360p',
            format: 'mp4',
            url: `https://www.y2mate.com/youtube/${videoId}`,
            fallback: true
          }
        ],
        downloadUrl: `https://www.y2mate.com/youtube/${videoId}`,
        note: 'Using fallback download service'
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process video: ' + error.message
      });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;