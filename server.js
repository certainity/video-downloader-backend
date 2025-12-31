// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---- REQUIRED ----
const COBALT_BASE_URL_RAW = process.env.COBALT_BASE_URL;
if (!COBALT_BASE_URL_RAW) {
  console.error('❌ Missing COBALT_BASE_URL env var');
}
const COBALT_BASE_URL = (COBALT_BASE_URL_RAW || '').replace(/\/+$/, ''); // remove trailing slashes
const COBALT_ENDPOINT = `${COBALT_BASE_URL}/`; // Cobalt expects POST /

const COBALT_HEADERS = {
  // These 2 headers matter (very often the reason for invalid_body)
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

function isValidHttpUrl(maybeUrl) {
  try {
    const u = new URL(maybeUrl);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function detectPlatform(inputUrl) {
  try {
    const host = new URL(inputUrl).hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'Facebook';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'Twitter/X';
    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// Health
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    backend: 'video-downloader-backend',
    cobalt: COBALT_BASE_URL || null,
  });
});

// Fetch basic info + provide quality buttons (the actual download happens on /api/download)
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || !isValidHttpUrl(url)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid URL.' });
    }

    const platform = detectPlatform(url);

    // Lightweight metadata (works well for YouTube; others may be blank)
    let title = 'Video';
    let author = '';
    let thumbnail = '';
    let duration = '';

    // YouTube oEmbed (no API key needed)
    if (platform === 'YouTube') {
      try {
        const oembed = await axios.get('https://www.youtube.com/oembed', {
          params: { url, format: 'json' },
          timeout: 15000,
        });
        title = oembed.data?.title || title;
        author = oembed.data?.author_name || author;
        thumbnail = oembed.data?.thumbnail_url || thumbnail;
      } catch {
        // ignore oEmbed failures
      }
    }

    const qualities = ['1080', '720', '480', '360'].map((q) => ({
      quality: `${q}p`,
      format: 'mp4',
      directDownload: true,
      url:
        `/api/download?url=${encodeURIComponent(url)}` +
        `&videoQuality=${q}` +
        `&downloadMode=auto` +
        `&youtubeVideoCodec=h264` +
        `&youtubeVideoContainer=auto`,
    }));

    return res.json({
      success: true,
      platform,
      title,
      author,
      thumbnail,
      duration,
      qualities,
      note:
        platform === 'YouTube'
          ? 'If YouTube blocks Render IPs you may need cookies/session (see note below).'
          : '',
    });
  } catch (err) {
    console.error('video-info error:', err?.message);
    res.status(500).json({ success: false, error: 'Server error while fetching info.' });
  }
});

// Main download endpoint: browser opens this => backend calls cobalt => redirect to real file url
app.get('/api/download', async (req, res) => {
  try {
    if (!COBALT_BASE_URL) {
      return res.status(500).json({
        error: 'Server is missing COBALT_BASE_URL. Set it in Render env vars to your own cobalt instance URL.',
      });
    }

    const url = req.query.url;
    const videoQuality = req.query.videoQuality; // "1080" etc
    const downloadMode = req.query.downloadMode || 'auto'; // auto|audio|mute
    const youtubeVideoCodec = req.query.youtubeVideoCodec || 'h264';
    const youtubeVideoContainer = req.query.youtubeVideoContainer || 'auto';
    const youtubeHLS = req.query.youtubeHLS === 'true'; // optional

    if (!url || !isValidHttpUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL.' });
    }

    // IMPORTANT: only send fields that are defined (avoid invalid_body)
    const body = {
      url,
      downloadMode,
    };

    // Cobalt expects quality like "1080" or "max"
    if (videoQuality) body.videoQuality = String(videoQuality).replace(/p$/i, '');

    // YouTube options
    if (youtubeVideoCodec) body.youtubeVideoCodec = youtubeVideoCodec;
    if (youtubeVideoContainer) body.youtubeVideoContainer = youtubeVideoContainer;
    if (youtubeHLS) body.youtubeHLS = true;

    const cobaltResp = await axios.post(COBALT_ENDPOINT, body, {
      headers: COBALT_HEADERS,
      timeout: 60000,
      validateStatus: () => true,
    });

    const statusCode = cobaltResp.status;
    const data = cobaltResp.data;

    // Cobalt success usually returns { status: "redirect"|"tunnel", url: "..." }
    if (statusCode >= 200 && statusCode < 300 && data && data.url) {
      if (data.status === 'redirect' || data.status === 'tunnel') {
        return res.redirect(data.url);
      }

      // If picker/local-processing happens, return JSON so you can see why
      return res.status(200).json({
        success: true,
        cobaltStatus: data.status,
        cobaltResponse: data,
      });
    }

    // Failure (return your existing debug style)
    return res.status(500).json({
      error: 'Failed to generate download link. Please try again.',
      debug: {
        cobalt: COBALT_BASE_URL,
        status: statusCode,
        sentBody: body,
        body: data,
      },
    });
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;

    return res.status(500).json({
      error: 'Failed to generate download link. Please try again.',
      debug: {
        cobalt: COBALT_BASE_URL,
        status,
        body,
        message: err?.message,
      },
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

module.exports = app;
