const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// RapidAPI Configuration - Based on your screenshot
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'YOUR_RAPIDAPI_KEY_HERE';
const RAPIDAPI_HOST = 'youtube-video-download-api1.p.rapidapi.com';
const API_ENDPOINT = 'https://youtube-video-download-api1.p.rapidapi.com/api/youtube';

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

    // Construct full YouTube URL for the API
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`YouTube URL: ${youtubeUrl}`);
    console.log(`API Endpoint: ${API_ENDPOINT}`);
    console.log(`API Key: ${RAPIDAPI_KEY.substring(0, 10)}...`);

    // Call RapidAPI with correct format
    const options = {
      method: 'GET',
      url: API_ENDPOINT,
      params: {
        url: youtubeUrl
      },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      timeout: 25000
    };

    console.log('Making API request...');
    const response = await axios.request(options);
    const data = response.data;

    console.log('API Response Status:', response.status);
    console.log('API Response Data:', JSON.stringify(data, null, 2));

    // Parse the response based on actual API structure
    let title, thumbnail, author, duration, qualities = [];

    // Try different possible response structures
    if (data.title) {
      title = data.title;
      thumbnail = data.thumbnail || data.thumb || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      author = data.author || data.channel || data.uploader || 'YouTube Channel';
      duration = data.duration || data.lengthSeconds || 0;

      // Extract formats/qualities
      if (data.formats && Array.isArray(data.formats)) {
        console.log(`Found ${data.formats.length} formats`);
        
        // Filter and sort formats
        const videoFormats = data.formats
          .filter(f => f.url && f.hasVideo && f.hasAudio)
          .sort((a, b) => (b.height || 0) - (a.height || 0));

        // Get unique qualities
        const qualityMap = new Map();
        videoFormats.forEach(format => {
          const height = format.height || format.quality;
          const qualityLabel = format.qualityLabel || `${height}p`;
          
          if (!qualityMap.has(qualityLabel) && format.url) {
            qualityMap.set(qualityLabel, {
              quality: qualityLabel,
              format: 'mp4',
              url: format.url,
              directDownload: true,
              size: format.contentLength
            });
          }
        });

        qualities = Array.from(qualityMap.values());
      } else if (data.links || data.downloadLinks) {
        // Alternative structure
        const links = data.links || data.downloadLinks;
        Object.keys(links).forEach(key => {
          const link = links[key];
          if (link && link.url) {
            qualities.push({
              quality: link.quality || key,
              format: 'mp4',
              url: link.url,
              directDownload: true
            });
          }
        });
      }
    } else if (data.status === 'ok' && data.link) {
      // Another possible structure
      title = data.title || 'YouTube Video';
      thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      author = data.author || 'YouTube Channel';
      duration = data.duration || 0;

      Object.keys(data.link).forEach(quality => {
        const url = Array.isArray(data.link[quality]) 
          ? data.link[quality][0] 
          : data.link[quality];
        
        if (url) {
          qualities.push({
            quality: quality.includes('p') ? quality : `${quality}p`,
            format: 'mp4',
            url: url,
            directDownload: true
          });
        }
      });
    }

    // If still no data, try to parse whatever we got
    if (!title) {
      console.error('Unexpected API response structure:', data);
      return res.status(500).json({
        success: false,
        error: 'Unexpected API response format',
        debug: JSON.stringify(data).substring(0, 200)
      });
    }

    if (qualities.length === 0) {
      return res.json({
        success: false,
        error: 'No downloadable formats available for this video'
      });
    }

    console.log(`✅ Successfully fetched: ${title}`);
    console.log(`✅ Found ${qualities.length} qualities`);

    return res.json({
      success: true,
      platform: 'YouTube',
      title: title,
      thumbnail: thumbnail,
      duration: formatDuration(duration),
      author: author,
      videoId: videoId,
      qualities: qualities,
      note: 'Direct download from RapidAPI'
    });

  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Error Message:', error.message);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 403) {
        return res.status(403).json({
          success: false,
          error: 'Invalid API key or not subscribed to this API.',
          details: 'Please check: 1) Your API key is correct, 2) You are subscribed to the YouTube Video Download API on RapidAPI',
          apiKey: `${RAPIDAPI_KEY.substring(0, 10)}...`,
          host: RAPIDAPI_HOST
        });
      }
      
      if (error.response.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'API rate limit exceeded. Please wait or upgrade your plan.'
        });
      }

      if (error.response.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'API endpoint not found. The API structure may have changed.',
          endpoint: API_ENDPOINT
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

// Download endpoint
app.get('/api/download', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Download URL required' });
    }

    console.log(`Redirecting to: ${url.substring(0, 50)}...`);
    res.redirect(url);

  } catch (error) {
    console.error('Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed' });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n================================');
  console.log('🚀 Video Downloader API');
  console.log('================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📝 Health: http://localhost:${PORT}/api/health`);
  console.log(`🔑 API Key: ${RAPIDAPI_KEY !== 'YOUR_RAPIDAPI_KEY_HERE' ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🌐 API Host: ${RAPIDAPI_HOST}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('================================\n');
});

module.exports = app;