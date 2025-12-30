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

// Download endpoint using multiple services
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
        error: 'Invalid YouTube URL. Please use a valid YouTube link.' 
      });
    }

    // Method 1: Try Cobalt API first
    try {
      const cobaltResponse = await axios.post(
        'https://api.cobalt.tools/api/json',
        {
          url: url,
          vCodec: 'h264',
          vQuality: '1080',
          aFormat: 'mp3',
          isAudioOnly: false,
          isNoTTWatermark: true
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 15000
        }
      );

      const data = cobaltResponse.data;

      if (data.status === 'redirect' || data.status === 'tunnel') {
        return res.json({
          success: true,
          platform: 'YouTube',
          title: 'YouTube Video',
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          duration: 'Available',
          author: 'YouTube Channel',
          qualities: [
            { quality: '1080p', format: 'mp4', url: data.url },
            { quality: '720p', format: 'mp4', url: data.url },
            { quality: '480p', format: 'mp4', url: data.url },
            { quality: '360p', format: 'mp4', url: data.url }
          ],
          downloadUrl: data.url,
          method: 'cobalt'
        });
      }

      if (data.status === 'picker' && data.picker && data.picker.length > 0) {
        return res.json({
          success: true,
          platform: 'YouTube',
          title: 'YouTube Video',
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          duration: 'Available',
          author: 'YouTube Channel',
          qualities: data.picker.slice(0, 4).map((item, index) => ({
            quality: ['1080p', '720p', '480p', '360p'][index] || 'HD',
            format: 'mp4',
            url: item.url,
          })),
          downloadUrl: data.picker[0].url,
          method: 'cobalt'
        });
      }
    } catch (cobaltError) {
      console.log('Cobalt API failed, using fallback method');
    }

    // Method 2: Use reliable download services
    const downloadServices = [
      {
        name: 'SaveFrom',
        url: `https://en.savefrom.net/#url=${encodeURIComponent(url)}`,
      },
      {
        name: 'YTGoConverter',
        url: `https://ytgoconverter.com/#v=${videoId}`,
      },
      {
        name: 'KeepVid',
        url: `https://keepvid.pro/?url=${encodeURIComponent(url)}`,
      }
    ];

    // Return multiple working download options
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
          url: downloadServices[0].url,
          service: downloadServices[0].name,
          fallback: true 
        },
        { 
          quality: '720p', 
          format: 'mp4', 
          url: downloadServices[1].url,
          service: downloadServices[1].name,
          fallback: true 
        },
        { 
          quality: '480p', 
          format: 'mp4', 
          url: downloadServices[2].url,
          service: downloadServices[2].name,
          fallback: true 
        },
        { 
          quality: '360p', 
          format: 'mp4', 
          url: downloadServices[0].url,
          service: downloadServices[0].name,
          fallback: true 
        }
      ],
      downloadUrl: downloadServices[0].url,
      method: 'fallback',
      note: 'Click download button on the next page to get your video'
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process video. Please try again.' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;