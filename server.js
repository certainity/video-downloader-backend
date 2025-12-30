// ============================================
// VIDEO DOWNLOADER BACKEND API
// ============================================
// File: server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const ytdl = require('ytdl-core');
const { instagramGetUrl } = require('instagram-url-direct');
const twitterGetUrl = require('twitter-url-direct');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper function to detect platform
const detectPlatform = (url) => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
  if (lowerUrl.includes('instagram.com')) return 'instagram';
  if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) return 'facebook';
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter';
  if (lowerUrl.includes('tiktok.com')) return 'tiktok';
  if (lowerUrl.includes('snapchat.com')) return 'snapchat';
  return null;
};

// Helper function to format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// Helper function to format duration
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

// ============================================
// YOUTUBE DOWNLOADER
// ============================================
const downloadYouTube = async (url) => {
  try {
    const info = await ytdl.getInfo(url);
    
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    const qualities = [];

    // Extract available qualities
    formats.forEach(format => {
      if (format.qualityLabel && !qualities.find(q => q.quality === format.qualityLabel)) {
        qualities.push({
          quality: format.qualityLabel,
          format: format.container,
          size: format.contentLength ? formatBytes(parseInt(format.contentLength)) : 'Unknown',
          url: format.url,
          itag: format.itag
        });
      }
    });

    return {
      success: true,
      platform: 'YouTube',
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
      duration: formatDuration(parseInt(info.videoDetails.lengthSeconds)),
      author: info.videoDetails.author.name,
      qualities: qualities.sort((a, b) => {
        const order = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1 };
        return (order[b.quality] || 0) - (order[a.quality] || 0);
      }),
      downloadUrl: formats[0]?.url
    };
  } catch (error) {
    throw new Error('Failed to fetch YouTube video: ' + error.message);
  }
};

// ============================================
// INSTAGRAM DOWNLOADER
// ============================================
const downloadInstagram = async (url) => {
  try {
    const result = await instagramGetUrl(url);
    
    return {
      success: true,
      platform: 'Instagram',
      title: 'Instagram Video',
      thumbnail: result.thumb || result.url_list[0],
      duration: 'Unknown',
      qualities: result.url_list.map((url, index) => ({
        quality: index === 0 ? 'HD' : 'SD',
        format: 'mp4',
        size: 'Unknown',
        url: url
      })),
      downloadUrl: result.url_list[0]
    };
  } catch (error) {
    throw new Error('Failed to fetch Instagram video: ' + error.message);
  }
};

// ============================================
// FACEBOOK DOWNLOADER (using RapidAPI)
// ============================================
const downloadFacebook = async (url) => {
  try {
    const options = {
      method: 'GET',
      url: 'https://facebook-reel-and-video-downloader.p.rapidapi.com/app/main.php',
      params: { url: url },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY, // Add your RapidAPI key
        'X-RapidAPI-Host': 'facebook-reel-and-video-downloader.p.rapidapi.com'
      }
    };

    const response = await axios.request(options);
    const data = response.data;

    return {
      success: true,
      platform: 'Facebook',
      title: data.title || 'Facebook Video',
      thumbnail: data.thumbnail || '',
      duration: 'Unknown',
      qualities: [
        { quality: 'HD', format: 'mp4', size: 'Unknown', url: data.links?.['Download High Quality'] },
        { quality: 'SD', format: 'mp4', size: 'Unknown', url: data.links?.['Download Low Quality'] }
      ].filter(q => q.url),
      downloadUrl: data.links?.['Download High Quality'] || data.links?.['Download Low Quality']
    };
  } catch (error) {
    throw new Error('Failed to fetch Facebook video: ' + error.message);
  }
};

// ============================================
// TWITTER/X DOWNLOADER
// ============================================
const downloadTwitter = async (url) => {
  try {
    const result = await twitterGetUrl(url);
    
    return {
      success: true,
      platform: 'Twitter/X',
      title: 'Twitter Video',
      thumbnail: result.thumb || '',
      duration: 'Unknown',
      qualities: result.variants?.map((variant, index) => ({
        quality: variant.bitrate ? `${Math.floor(variant.bitrate / 1000)}k` : 'SD',
        format: 'mp4',
        size: 'Unknown',
        url: variant.url
      })) || [],
      downloadUrl: result.variants?.[0]?.url
    };
  } catch (error) {
    throw new Error('Failed to fetch Twitter video: ' + error.message);
  }
};

// ============================================
// TIKTOK DOWNLOADER (using RapidAPI)
// ============================================
const downloadTikTok = async (url) => {
  try {
    const options = {
      method: 'GET',
      url: 'https://tiktok-download-without-watermark.p.rapidapi.com/analysis',
      params: { url: url },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'tiktok-download-without-watermark.p.rapidapi.com'
      }
    };

    const response = await axios.request(options);
    const data = response.data.data;

    return {
      success: true,
      platform: 'TikTok',
      title: data.title || 'TikTok Video',
      thumbnail: data.cover || data.origin_cover,
      duration: formatDuration(data.duration),
      author: data.author?.nickname,
      qualities: [
        { quality: 'HD (No Watermark)', format: 'mp4', size: 'Unknown', url: data.play },
        { quality: 'With Watermark', format: 'mp4', size: 'Unknown', url: data.wmplay }
      ],
      downloadUrl: data.play
    };
  } catch (error) {
    throw new Error('Failed to fetch TikTok video: ' + error.message);
  }
};

// ============================================
// MAIN API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Video Downloader API is running' });
});

// Get video info
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const platform = detectPlatform(url);

    if (!platform) {
      return res.status(400).json({ 
        success: false, 
        error: 'Platform not supported or invalid URL' 
      });
    }

    let result;

    switch (platform) {
      case 'youtube':
        result = await downloadYouTube(url);
        break;
      case 'instagram':
        result = await downloadInstagram(url);
        break;
      case 'facebook':
        result = await downloadFacebook(url);
        break;
      case 'twitter':
        result = await downloadTwitter(url);
        break;
      case 'tiktok':
        result = await downloadTikTok(url);
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Platform not yet implemented' 
        });
    }

    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to process video' 
    });
  }
});

// Download video endpoint (streams the video)
app.get('/api/download', async (req, res) => {
  try {
    const { url, quality } = req.query;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const platform = detectPlatform(url);

    if (platform === 'youtube') {
      const info = await ytdl.getInfo(url);
      const format = ytdl.chooseFormat(info.formats, { quality: quality || 'highest' });

      res.header('Content-Disposition', `attachment; filename="${info.videoDetails.title}.mp4"`);
      
      ytdl(url, { format: format })
        .pipe(res)
        .on('error', (error) => {
          console.error('Download error:', error);
          res.status(500).json({ success: false, error: 'Download failed' });
        });
    } else {
      // For other platforms, redirect to the direct download URL
      res.redirect(url);
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Download failed' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;