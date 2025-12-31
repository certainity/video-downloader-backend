/**
 * server.js (FULL FILE)
 * Fix: Use your own Cobalt instance (POST /) with the correct request body.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

const COBALT_BASE_URL = (process.env.COBALT_BASE_URL || '').trim().replace(/\/+$/, ''); // no trailing slash

// Middleware
app.use(cors());
app.use(express.json());

// Helper: extract YouTube ID (still used only for metadata + thumbnail)
const extractYouTubeId = (url) => {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/
  );
  return match ? match[1] : null;
};

// Helper: detect platform (simple)
const detectPlatform = (url) => {
  const u = (url || '').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'Facebook';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X';
  return 'Unknown';
};

// Helper: normalize quality into Cobalt's expected "videoQuality" (numbers only or "max")
const normalizeQuality = (q) => {
  if (!q) return '1080';
  const s = String(q).toLowerCase().trim();
  if (s === 'max' || s === 'best') return 'max';
  // accept "1080p" or "1080"
  const m = s.match(/\d+/);
  return m ? m[0] : '1080';
};

// Health
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'video-downloader-backend',
    cobaltConfigured: Boolean(COBALT_BASE_URL),
    cobaltBase: COBALT_BASE_URL || null,
    time: new Date().toISOString(),
  });
});

/**
 * Get video info (metadata) + build directDownload quality buttons
 * IMPORTANT CHANGE:
 * - We now build download URLs using the ORIGINAL URL:
 *   /api/download?url=<encoded>&quality=1080
 */
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'URL required' });
    }

    const cleanUrl = url.trim();
    const platform = detectPlatform(cleanUrl);

    // Default minimal metadata
    let title = 'Video';
    let author = '';
    let thumbnail = '';
    let note = '';

    // If YouTube, fetch oEmbed title/author
    const ytId = extractYouTubeId(cleanUrl);
    if (platform === 'YouTube' && ytId) {
      thumbnail = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
      try {
        const oembed = await axios.get('https://www.youtube.com/oembed', {
          params: { url: cleanUrl, format: 'json' },
          timeout: 15000,
        });
        title = oembed.data?.title || title;
        author = oembed.data?.author_name || author;
      } catch (e) {
        note = 'Could not fetch full metadata, but download may still work.';
      }
    } else {
      // Non-YouTube: metadata might not be available from oEmbed
      title = `${platform} Video`;
      note = 'Metadata may be limited for this platform, but download can still work.';
    }

    const encoded = encodeURIComponent(cleanUrl);
    const qualities = ['1080', '720', '480', '360'].map((q) => ({
      quality: `${q}p`,
      format: 'mp4',
      url: `/api/download?url=${encoded}&quality=${q}`,
      directDownload: true,
    }));

    return res.json({
      success: true,
      platform,
      title,
      thumbnail: thumbnail || 'https://via.placeholder.com/480x270/667eea/ffffff?text=Video',
      duration: 'Available',
      author: author || '',
      qualities,
      note: note || '',
    });
  } catch (err) {
    console.error('video-info error:', err?.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch video info' });
  }
});

/**
 * DOWNLOAD endpoint:
 * Calls YOUR cobalt instance at POST /
 * with correct body schema for v10+
 */
app.get('/api/download', async (req, res) => {
  try {
    const url = (req.query.url || '').toString().trim();
    const quality = normalizeQuality(req.query.quality);

    if (!COBALT_BASE_URL) {
      return res.status(500).json({
        error: 'Server is missing COBALT_BASE_URL. Set it in Render env vars to your Cobalt instance URL.',
      });
    }

    if (!url) {
      return res.status(400).json({ error: 'url query param is required' });
    }

    const cobaltEndpoint = `${COBALT_BASE_URL}/`; // IMPORTANT: POST /
    const requestBody = {
      url,
      videoQuality: quality,         // <-- correct key for v10+
      downloadMode: 'auto',
      // optional YouTube tuning (safe defaults)
      youtubeVideoCodec: 'h264',
      youtubeVideoContainer: 'auto',
    };

    const cobaltResp = await axios.post(cobaltEndpoint, requestBody, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 60000,
      validateStatus: () => true,
    });

    // If not 200, show debug
    if (cobaltResp.status !== 200) {
      return res.status(500).json({
        error: 'Failed to generate download link. Please try again.',
        debug: {
          cobalt: COBALT_BASE_URL,
          status: cobaltResp.status,
          sentBody: requestBody,
          body: cobaltResp.data,
        },
      });
    }

    const data = cobaltResp.data;

    // Cobalt success statuses usually include: redirect / tunnel / picker / local-processing
    if (!data || data.status === 'error') {
      return res.status(500).json({
        error: 'Failed to generate download link. Please try again.',
        debug: {
          cobalt: COBALT_BASE_URL,
          sentBody: requestBody,
          body: data,
        },
      });
    }

    // Common case: redirect/tunnel provides a direct URL
    if ((data.status === 'redirect' || data.status === 'tunnel') && data.url) {
      return res.redirect(data.url);
    }

    // If picker, pick first item
    if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length) {
      const first = data.picker[0];
      if (first?.url) return res.redirect(first.url);
    }

    // local-processing needs client-side ffmpeg; not supported in this simple backend
    return res.status(500).json({
      error: 'Cobalt returned a response type that this backend does not handle.',
      debug: {
        cobalt: COBALT_BASE_URL,
        sentBody: requestBody,
        body: data,
      },
    });
  } catch (err) {
    console.error('download error:', err?.message);
    return res.status(500).json({ error: 'Download failed', debug: { message: err?.message } });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`🧪 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
