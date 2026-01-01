const express = require('express');
const cors = require('cors');
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

    console.log('Received request for URL:', url);

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const videoId = extractVideoId(url);
    
    if (!videoId) {
      console.log('Invalid video ID extracted from:', url);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid YouTube URL. Please enter a valid YouTube video link.' 
      });
    }

    console.log('Extracted video ID:', videoId);

    // Try to get video info from YouTube oEmbed
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      console.log('Fetching from oEmbed:', oembedUrl);
      
      const response = await axios.get(oembedUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const data = response.data;
      console.log('Successfully fetched video:', data.title);

      // Generate download URLs using ssyoutube.com method
      const ssUrl = `https://www.ssyoutube.com/watch?v=${videoId}`;

      return res.json({
        success: true,
        platform: 'YouTube',
        title: data.title,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: data.author_name || 'YouTube Channel',
        videoId: videoId,
        qualities: [
          { 
            quality: '1080p', 
            format: 'mp4',
            url: ssUrl,
            directDownload: false,
            external: true
          },
          { 
            quality: '720p', 
            format: 'mp4',
            url: ssUrl,
            directDownload: false,
            external: true
          },
          { 
            quality: '480p', 
            format: 'mp4',
            url: ssUrl,
            directDownload: false,
            external: true
          },
          { 
            quality: '360p', 
            format: 'mp4',
            url: ssUrl,
            directDownload: false,
            external: true
          }
        ],
        note: 'Click any quality to open download page',
        method: 'ssyoutube'
      });

    } catch (error) {
      console.error('oEmbed fetch failed:', error.message);
      
      // Fallback response
      const ssUrl = `https://www.ssyoutube.com/watch?v=${videoId}`;
      
      return res.json({
        success: true,
        platform: 'YouTube',
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: 'YouTube Channel',
        videoId: videoId,
        qualities: [
          { 
            quality: '1080p', 
            format: 'mp4',
            url: ssUrl,
            directDownload: false,
            external: true
          },
          { 
            quality: '720p', 
            format: 'mp4',
            url: ssUrl,
            directDownload: false,
            external: true
          },
          { 
            quality: '480p', 
            format: 'mp4',
            url: ssUrl,
            directDownload: false,
            external: true
          },
          { 
            quality: '360p', 
            format: 'mp4',
            url: ssUrl,
            directDownload: false,
            external: true
          }
        ],
        note: 'Click any quality to open download page',
        method: 'ssyoutube_fallback'
      });
    }

  } catch (error) {
    console.error('Error in video-info endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process video. Please try again.'
    });
  }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
  try {
    const { videoId } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }

    // Redirect to ssyoutube.com
    const redirectUrl = `https://www.ssyoutube.com/watch?v=${videoId}`;
    console.log('Redirecting to:', redirectUrl);
    
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
  console.log(`✅ Ready to accept requests`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
