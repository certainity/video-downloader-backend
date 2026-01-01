const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// RapidAPI Configuration for YouTube Video FAST Downloader 24/7
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'bc7d17dd7fmshd4cb6ada6e4b24cp1f4f25jsn95791286a8d6';
const RAPIDAPI_HOST = 'youtube-video-fast-downloader-24-7.p.rapidapi.com';

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
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Video Downloader API is running',
    api: 'YouTube Video FAST Downloader 24/7',
    rapidapi: RAPIDAPI_KEY !== 'YOUR_RAPIDAPI_KEY_HERE',
    host: RAPIDAPI_HOST,
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

    console.log(`\n=== Fetching Video Info ===`);
    console.log(`Video ID: ${videoId}`);

    // Check if API key is set
    if (RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY_HERE') {
      return res.status(500).json({
        success: false,
        error: 'RapidAPI key not configured. Please set RAPIDAPI_KEY environment variable.'
      });
    }

    // First, get video details and quality options
    const detailsOptions = {
      method: 'GET',
      url: `https://${RAPIDAPI_HOST}/download_video/${videoId}`,
      params: {
        quality: '247'  // Get all quality info
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      timeout: 20000
    };

    console.log(`Calling API: https://${RAPIDAPI_HOST}/download_video/${videoId}`);
    console.log(`API Key: ${RAPIDAPI_KEY.substring(0, 10)}...`);

    const response = await axios.request(detailsOptions);
    const data = response.data;

    console.log('API Response:', JSON.stringify(data, null, 2));

    // Parse response
    let title, thumbnail, author, duration;
    let qualities = [];

    if (data.title) {
      title = data.title;
      thumbnail = data.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      author = data.channel || data.author || 'YouTube Channel';
      duration = data.duration || 0;

      // Get available quality options
      // The API typically returns download links for different qualities
      const qualityOptions = ['247', '136', '135', '134', '133', '160'];
      const qualityLabels = {
        '247': '720p',
        '136': '720p HD',
        '135': '480p',
        '134': '360p',
        '133': '240p',
        '160': '144p'
      };

      // Add qualities based on what's available
      for (const itag of qualityOptions) {
        qualities.push({
          quality: qualityLabels[itag] || `Quality ${itag}`,
          format: 'mp4',
          url: `/api/download?videoId=${videoId}&quality=${itag}`,
          directDownload: true,
          itag: itag
        });
      }

    } else if (data.downloadUrl || data.url) {
      // Direct download URL returned
      title = 'YouTube Video';
      thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      author = 'YouTube Channel';
      duration = 0;

      qualities.push({
        quality: 'Best Available',
        format: 'mp4',
        url: data.downloadUrl || data.url,
        directDownload: true,
        external: true
      });
    } else {
      console.error('Unexpected API response:', data);
      
      // Fallback: provide standard quality options
      title = 'YouTube Video';
      thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      author = 'YouTube Channel';
      duration = 0;

      qualities = [
        {
          quality: '720p',
          format: 'mp4',
          url: `/api/download?videoId=${videoId}&quality=247`,
          directDownload: true
        },
        {
          quality: '480p',
          format: 'mp4',
          url: `/api/download?videoId=${videoId}&quality=135`,
          directDownload: true
        },
        {
          quality: '360p',
          format: 'mp4',
          url: `/api/download?videoId=${videoId}&quality=134`,
          directDownload: true
        }
      ];
    }

    console.log(`✅ Video: ${title}`);
    console.log(`✅ Qualities: ${qualities.length}`);

    return res.json({
      success: true,
      platform: 'YouTube',
      title: title,
      thumbnail: thumbnail,
      duration: formatDuration(duration),
      author: author,
      videoId: videoId,
      qualities: qualities,
      note: 'Direct download via RapidAPI'
    });

  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      
      if (error.response.status === 403) {
        return res.status(403).json({
          success: false,
          error: 'Invalid API key or subscription issue.',
          details: 'Please verify: 1) API key is correct, 2) You are subscribed to "YouTube Video FAST Downloader 24/7"',
          help: 'Visit https://rapidapi.com/ytjar/api/youtube-video-fast-downloader-24-7'
        });
      }
      
      if (error.response.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please wait or upgrade your plan.'
        });
      }
    }

    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch video information',
      details: error.message
    });
  }
});

// Download video
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, quality, url } = req.query;

    // If direct URL provided, redirect to it
    if (url) {
      console.log('Redirecting to direct URL');
      return res.redirect(url);
    }

    if (!videoId || !quality) {
      return res.status(400).json({ error: 'Video ID and quality required' });
    }

    console.log(`\n=== Downloading Video ===`);
    console.log(`Video ID: ${videoId}`);
    console.log(`Quality: ${quality}`);

    if (RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY_HERE') {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Call the download endpoint
    const options = {
      method: 'GET',
      url: `https://${RAPIDAPI_HOST}/download_video/${videoId}`,
      params: {
        quality: quality
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      timeout: 30000
    };

    console.log(`Fetching download URL...`);
    const response = await axios.request(options);
    const data = response.data;

    console.log('Download Response:', JSON.stringify(data, null, 2));

    // Extract download URL
    let downloadUrl = null;

    if (data.downloadUrl) {
      downloadUrl = data.downloadUrl;
    } else if (data.url) {
      downloadUrl = data.url;
    } else if (data.link) {
      downloadUrl = data.link;
    } else if (typeof data === 'string' && data.startsWith('http')) {
      downloadUrl = data;
    }

    if (!downloadUrl) {
      console.error('No download URL found in response');
      return res.status(404).json({ 
        error: 'Download link not available',
        response: data
      });
    }

    console.log(`✅ Redirecting to: ${downloadUrl.substring(0, 50)}...`);
    res.redirect(downloadUrl);

  } catch (error) {
    console.error('Download error:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    
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
  console.log('\n================================');
  console.log('🚀 Video Downloader API');
  console.log('================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📝 Health: http://localhost:${PORT}/api/health`);
  console.log(`🎬 API: YouTube Video FAST Downloader 24/7`);
  console.log(`🔑 API Key: ${RAPIDAPI_KEY !== 'YOUR_RAPIDAPI_KEY_HERE' ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🌐 Host: ${RAPIDAPI_HOST}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('================================\n');
  
  if (RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY_HERE') {
    console.log('⚠️  Set your API key:');
    console.log('   export RAPIDAPI_KEY="your_key_here"\n');
  }
});

module.exports = app;