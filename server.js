const express = require('express');
const cors = require('cors');

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
  res.json({ status: 'OK', message: 'Video Downloader API is running' });
});

// Get video info using YouTube oEmbed (always works)
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
        error: 'Invalid YouTube URL. Please check the URL and try again.' 
      });
    }

    console.log(`Fetching info for video: ${videoId}`);

    // Use YouTube oEmbed API (no authentication needed, always works)
    const fetch = (await import('node-fetch')).default;
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube API returned ${response.status}`);
    }

    const data = await response.json();

    console.log(`Successfully fetched: ${data.title}`);

    // Return video info
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
          url: `https://loader.to/api/button/?url=https://www.youtube.com/watch?v=${videoId}&f=1080`,
          directDownload: false
        },
        { 
          quality: '720p', 
          format: 'mp4',
          url: `https://loader.to/api/button/?url=https://www.youtube.com/watch?v=${videoId}&f=720`,
          directDownload: false
        },
        { 
          quality: '480p', 
          format: 'mp4',
          url: `https://loader.to/api/button/?url=https://www.youtube.com/watch?v=${videoId}&f=480`,
          directDownload: false
        },
        { 
          quality: '360p', 
          format: 'mp4',
          url: `https://loader.to/api/button/?url=https://www.youtube.com/watch?v=${videoId}&f=360`,
          directDownload: false
        }
      ],
      note: 'Click a quality to start download'
    });

  } catch (error) {
    console.error('Error fetching video info:', error.message);
    
    // Return a more helpful error
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch video information. The video might be private, deleted, or region-blocked.'
    });
  }
});

// Download endpoint - redirect to external service
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, quality } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Redirect to a working download service
    const qualityMap = {
      '1080p': '1080',
      '720p': '720',
      '480p': '480',
      '360p': '360'
    };

    const q = qualityMap[quality] || '720';
    
    // Use loader.to which is more reliable
    const downloadUrl = `https://loader.to/api/button/?url=${encodeURIComponent(videoUrl)}&f=${q}`;
    
    res.redirect(downloadUrl);

  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
  console.log(`✅ Using YouTube oEmbed API for video info`);
});

module.exports = app;