// server.js (patched)

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper to extract video ID
const extractVideoId = (url) => {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/
  );
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
        error: 'Invalid YouTube URL',
      });
    }

    // Lightweight metadata via YouTube oembed
    try {
      const response = await axios.get(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { timeout: 10000 }
      );

      const videoInfo = response.data;

      return res.json({
        success: true,
        platform: 'YouTube',
        title: videoInfo.title || 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: videoInfo.author_name || 'YouTube Channel',
        videoId,
        qualities: [
          { quality: '1080p', format: 'mp4', url: `/api/download?videoId=${videoId}&quality=1080`, directDownload: true },
          { quality: '720p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=720`,  directDownload: true },
          { quality: '480p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=480`,  directDownload: true },
          { quality: '360p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=360`,  directDownload: true },
        ],
        downloadUrl: `/api/download?videoId=${videoId}&quality=1080`,
        method: 'direct',
      });
    } catch (error) {
      console.error('oEmbed Error:', error?.message);

      // Fallback response (still gives download buttons)
      return res.json({
        success: true,
        platform: 'YouTube',
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'Available',
        author: 'YouTube Channel',
        videoId,
        qualities: [
          { quality: '1080p', format: 'mp4', url: `/api/download?videoId=${videoId}&quality=1080`, directDownload: true },
          { quality: '720p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=720`,  directDownload: true },
          { quality: '480p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=480`,  directDownload: true },
          { quality: '360p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=360`,  directDownload: true },
        ],
        downloadUrl: `/api/download?videoId=${videoId}&quality=1080`,
        method: 'direct',
      });
    }
  } catch (error) {
    console.error('Error:', error?.message);
    res.status(500).json({ success: false, error: 'Failed to process video' });
  }
});

// Download endpoint (Cobalt)
app.get('/api/download', async (req, res) => {
  const { videoId, quality } = req.query;

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID required' });
  }

  // IMPORTANT:
  // Use a cobalt instance you control (recommended) or one that allows API usage.
  // New Cobalt API expects POST / (not /api/json) and schema keys like videoQuality, youtubeVideoCodec, audioFormat, downloadMode.
  const COBALT_BASE_URL = (process.env.COBALT_BASE_URL || '').trim();
  if (!COBALT_BASE_URL) {
    return res.status(500).json({
      error:
        'Server is missing COBALT_BASE_URL. Set it in Render env vars to your own cobalt instance URL.',
    });
  }

  const cobaltEndpoint = COBALT_BASE_URL.replace(/\/+$/, '') + '/';
  const q = String(quality || '1080'); // e.g. "1080", "720"

  try {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    // Optional auth for protected instances
    if (process.env.COBALT_AUTH) {
      headers.Authorization = process.env.COBALT_AUTH; // "Api-Key xxx" or "Bearer xxx"
    }

    const cobaltResponse = await axios.post(
      cobaltEndpoint,
      {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoQuality: q,             // "1080", "720", etc
        youtubeVideoCodec: 'h264',   // h264 / av1 / vp9
        audioFormat: 'best',         // best / mp3 / ogg / wav / opus
        downloadMode: 'auto',        // auto / audio / mute
        filenameStyle: 'basic',
      },
      { headers, timeout: 30000 }
    );

    const data = cobaltResponse.data;

    if (data?.status === 'redirect' || data?.status === 'tunnel') {
      return res.redirect(data.url);
    }

    if (data?.status === 'picker' && Array.isArray(data.picker) && data.picker.length > 0) {
      // Prefer first video item if available
      const pick =
        data.picker.find((p) => p.type === 'video' && p.url) ||
        data.picker.find((p) => p.url);

      if (pick?.url) return res.redirect(pick.url);
    }

    // If cobalt returns an error object, surface the reason for debugging
    if (data?.status === 'error') {
      console.error('Cobalt API returned error:', data);
      return res.status(500).json({
        error: `Cobalt error: ${data?.error?.code || data?.text || 'unknown'}`,
        details: data?.error?.context || null,
      });
    }

    console.error('Unexpected cobalt response:', data);
    return res.status(500).json({
      error: 'Download service returned an unexpected response.',
    });
  } catch (error) {
    const status = error?.response?.status;
    const body = error?.response?.data;

    console.error('Cobalt request failed:', {
      message: error?.message,
      status,
      body,
    });

    return res.status(500).json({
      error: 'Failed to generate download link. Please try again.',
      debug: status ? { status, body } : undefined,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
});

module.exports = app;
