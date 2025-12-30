const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Video Downloader API is running' });
});

// Get video info (YouTube only for now)
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid YouTube URL. Only YouTube is supported currently.' 
      });
    }

    const info = await ytdl.getInfo(url);
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    const qualities = [];

    formats.forEach(format => {
      if (format.qualityLabel && !qualities.find(q => q.quality === format.qualityLabel)) {
        qualities.push({
          quality: format.qualityLabel,
          format: format.container,
          url: format.url,
        });
      }
    });

    res.json({
      success: true,
      platform: 'YouTube',
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
      duration: Math.floor(info.videoDetails.lengthSeconds / 60) + ':' + (info.videoDetails.lengthSeconds % 60).toString().padStart(2, '0'),
      author: info.videoDetails.author.name,
      qualities: qualities,
      downloadUrl: formats[0]?.url
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch video info' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
});

module.exports = app;