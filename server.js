const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Helper to extract video ID from various platforms
const extractVideoId = (url) => {
  // YouTube
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/);
  if (ytMatch) return { platform: 'youtube', id: ytMatch[1] };

  // Instagram
  const igMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/);
  if (igMatch) return { platform: 'instagram', id: igMatch[1] };

  // TikTok
  const ttMatch = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
  if (ttMatch) return { platform: 'tiktok', id: ttMatch[1] };

  // Facebook
  const fbMatch = url.match(/facebook\.com/);
  if (fbMatch) return { platform: 'facebook', id: 'fb' };

  return null;
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

    const videoInfo = extractVideoId(url);
    
    if (!videoInfo) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid or unsupported URL. Please use YouTube, Instagram, TikTok, or Facebook links.' 
      });
    }

    // Method 1: Try using Y2Mate API (free alternative)
    if (videoInfo.platform === 'youtube') {
      try {
        const videoId = videoInfo.id;
        
        // Get video info from YouTube oEmbed
        const oembedResponse = await axios.get(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          { timeout: 10000 }
        );

        const title = oembedResponse.data.title || 'YouTube Video';
        const author = oembedResponse.data.author_name || 'YouTube Channel';

        // Return video info with download endpoints
        return res.json({
          success: true,
          platform: 'YouTube',
          title: title,
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          duration: 'Available',
          author: author,
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
          method: 'proxy',
          note: 'Click any quality to download'
        });

      } catch (error) {
        console.error('YouTube oEmbed Error:', error.message);
        
        // Fallback response even if oEmbed fails
        const videoId = videoInfo.id;
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
          method: 'proxy',
          note: 'Click any quality to download'
        });
      }
    }

    // For other platforms
    return res.json({
      success: true,
      platform: videoInfo.platform,
      title: `${videoInfo.platform} Video`,
      thumbnail: 'https://via.placeholder.com/640x360/667eea/ffffff?text=Video',
      duration: 'Available',
      author: 'Content Creator',
      qualities: [
        { 
          quality: 'HD', 
          format: 'mp4',
          url: `/api/download-generic?url=${encodeURIComponent(url)}`,
          directDownload: true
        }
      ],
      note: `${videoInfo.platform} video detected`
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process video' 
    });
  }
});

// Download endpoint using multiple services as fallback
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, quality } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Method 1: Try yt5s.io API (working alternative)
    try {
      console.log('Attempting download via yt5s.io...');
      
      // Step 1: Get video info from yt5s
      const infoResponse = await axios.post(
        'https://yt5s.io/api/ajaxSearch',
        new URLSearchParams({
          q: videoUrl,
          vt: 'mp4'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 20000
        }
      );

      if (infoResponse.data && infoResponse.data.status === 'ok') {
        const links = infoResponse.data.links?.mp4;
        
        if (links) {
          // Find the best matching quality
          let selectedLink = null;
          
          if (quality === '1080' && links['1080']) {
            selectedLink = links['1080'];
          } else if (quality === '720' && links['720']) {
            selectedLink = links['720'];
          } else if (quality === '480' && links['480']) {
            selectedLink = links['480'];
          } else if (quality === '360' && links['360']) {
            selectedLink = links['360'];
          } else {
            // Get the highest available quality
            selectedLink = links['1080'] || links['720'] || links['480'] || links['360'] || links['144'];
          }

          if (selectedLink) {
            const k = selectedLink.k;
            
            // Step 2: Get actual download link
            const downloadResponse = await axios.post(
              'https://yt5s.io/api/ajaxConvert',
              new URLSearchParams({
                vid: videoId,
                k: k
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 30000
              }
            );

            if (downloadResponse.data && downloadResponse.data.status === 'ok') {
              const downloadUrl = downloadResponse.data.dlink;
              return res.redirect(downloadUrl);
            }
          }
        }
      }
    } catch (yt5sError) {
      console.error('yt5s.io failed:', yt5sError.message);
    }

    // Method 2: Try Y2Mate API
    try {
      console.log('Attempting download via Y2Mate...');
      
      const y2mateResponse = await axios.post(
        'https://www.y2mate.com/mates/analyzeV2/ajax',
        new URLSearchParams({
          k_query: videoUrl,
          k_page: 'home',
          hl: 'en',
          q_auto: '0'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 20000
        }
      );

      if (y2mateResponse.data && y2mateResponse.data.status === 'ok') {
        const links = y2mateResponse.data.links?.mp4;
        
        if (links) {
          let selectedKey = null;
          
          // Find matching quality
          for (const [key, value] of Object.entries(links)) {
            if (value.q === `${quality}p` || value.q === quality) {
              selectedKey = value.k;
              break;
            }
          }

          if (!selectedKey) {
            // Get first available
            selectedKey = Object.values(links)[0]?.k;
          }

          if (selectedKey) {
            const convertResponse = await axios.post(
              'https://www.y2mate.com/mates/convertV2/index',
              new URLSearchParams({
                vid: videoId,
                k: selectedKey
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 30000
              }
            );

            if (convertResponse.data && convertResponse.data.dlink) {
              return res.redirect(convertResponse.data.dlink);
            }
          }
        }
      }
    } catch (y2mateError) {
      console.error('Y2Mate failed:', y2mateError.message);
    }

    // Method 3: Try loader.to API
    try {
      console.log('Attempting download via loader.to...');
      
      const loaderResponse = await axios.get(
        `https://loader.to/ajax/download.php?format=${quality}p&url=${encodeURIComponent(videoUrl)}`,
        { timeout: 20000 }
      );

      if (loaderResponse.data && loaderResponse.data.download_url) {
        return res.redirect(loaderResponse.data.download_url);
      }
    } catch (loaderError) {
      console.error('Loader.to failed:', loaderError.message);
    }

    // If all methods fail, return error
    return res.status(503).json({ 
      error: 'All download services are currently unavailable. Please try again in a few moments.',
      suggestion: 'You can manually visit: https://yt5s.io or https://y2mate.com'
    });

  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ 
      error: 'Download failed. Please try again.',
      details: error.message 
    });
  }
});

// Generic download for other platforms
app.get('/api/download-generic', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    // Try using a generic video download service
    const response = await axios.get(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      { timeout: 15000 }
    );

    res.json({ 
      message: 'This platform is not yet fully supported. Use the original URL.',
      url: url
    });

  } catch (error) {
    console.error('Generic download error:', error.message);
    res.status(500).json({ error: 'Download not available for this platform yet' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
  console.log(`✅ Using yt5s.io, Y2Mate, and Loader.to as download services`);
});

module.exports = app;