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
  const match = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/);
  return match ? match[1] : null;
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Video Downloader API is running' });
});

// Get video info and download links
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

    // Use RapidAPI's YouTube to MP3/MP4 service (Free tier available)
    // You can also use: AllTube Download API, or yt-dlp
    
    // Method 1: Try using a free API service
    try {
      const response = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
        timeout: 10000
      });

      const videoInfo = response.data;

      // Return video info with direct YouTube links
      // Note: These are watch links, actual download requires yt-dlp or similar service
      return res.json({
        success: true,
        platform: 'YouTube',
        title: videoInfo.title || 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: videoInfo.author_name || 'YouTube Channel',
        videoId: videoId,
        qualities: [
          { 
            quality: '1080p', 
            format: 'mp4',
            // Generate direct download link that triggers browser download
            url: `/api/download?videoId=${videoId}&quality=1080`,
            directDownload: true
          },
          { 
            quality: '720p', 
            format: 'mp4',
            url: `/api/download?videoId=${videoId}&quality=720`,
            directDownload: true
          },
          { 
            quality: '480p', 
            format: 'mp4',
            url: `/api/download?videoId=${videoId}&quality=480`,
            directDownload: true
          },
          { 
            quality: '360p', 
            format: 'mp4',
            url: `/api/download?videoId=${videoId}&quality=360`,
            directDownload: true
          }
        ],
        downloadUrl: `/api/download?videoId=${videoId}&quality=1080`,
        method: 'direct'
      });

    } catch (error) {
      console.error('API Error:', error.message);
      
      // Fallback response
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
            url: `/api/download?videoId=${videoId}&quality=1080`,
            directDownload: true
          },
          { 
            quality: '720p', 
            format: 'mp4',
            url: `/api/download?videoId=${videoId}&quality=720`,
            directDownload: true
          },
          { 
            quality: '480p', 
            format: 'mp4',
            url: `/api/download?videoId=${videoId}&quality=480`,
            directDownload: true
          },
          { 
            quality: '360p', 
            format: 'mp4',
            url: `/api/download?videoId=${videoId}&quality=360`,
            directDownload: true
          }
        ],
        downloadUrl: `/api/download?videoId=${videoId}&quality=1080`,
        method: 'direct'
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process video' 
    });
  }
});

// Download endpoint - proxies through a working service
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, quality } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }

    // Use a free video download API service
    // Option 1: Use Cobalt API to get actual download link
    try {
      const cobaltResponse = await axios.post(
        'https://api.cobalt.tools/api/json',
        {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          vCodec: 'h264',
          vQuality: quality || '1080',
          aFormat: 'mp3',
          isAudioOnly: false
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 30000
        }
      );

      const data = cobaltResponse.data;

      if (data.status === 'redirect' || data.status === 'tunnel') {
        // Redirect to the actual download file
        return res.redirect(data.url);
      }

      if (data.status === 'picker' && data.picker && data.picker.length > 0) {
        return res.redirect(data.picker[0].url);
      }

      // If Cobalt fails, return error
      return res.status(500).json({ 
        error: 'Download service temporarily unavailable. Please try again.' 
      });

    } catch (error) {
      console.error('Download error:', error.message);
      return res.status(500).json({ 
        error: 'Failed to generate download link. Please try again.' 
      });
    }

  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;