require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Render env var on BACKEND service:
// COBALT_BASE_URL=https://cobalt-10-ikmn.onrender.com
const COBALT_BASE_URL = (process.env.COBALT_BASE_URL || '').replace(/\/+$/, '');

app.use(cors());
app.use(express.json());

// Helper to extract YouTube ID (your existing logic)
const extractVideoId = (url) => {
  const match = String(url).match(
    /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/
  );
  return match ? match[1] : null;
};

// Convert cobalt relative URLs like "/tunnel?..." to full URL
const absCobaltUrl = (u) => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${COBALT_BASE_URL}${u}`;
  return `${COBALT_BASE_URL}/${u}`;
};

// Only allow supported values (per cobalt docs)
const normalizeQuality = (q) => {
  const raw = String(q || '1080').trim().toLowerCase().replace('p', '');
  const allowed = new Set(['max','4320','2160','1440','1080','720','480','360','240','144']);
  return allowed.has(raw) ? raw : '1080';
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Video Downloader API is running',
    cobaltConfigured: Boolean(COBALT_BASE_URL),
    cobalt: COBALT_BASE_URL || null,
  });
});

// Video info endpoint (same UI output format you already use)
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ success: false, error: 'Invalid YouTube URL' });
    }

    // Fetch oEmbed for title/author (best-effort)
    let videoInfo = {};
    try {
      const r = await axios.get(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { timeout: 10000 }
      );
      videoInfo = r.data || {};
    } catch {}

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
      method: 'cobalt-v10',
    });
  } catch (error) {
    console.error('video-info error:', error?.message || error);
    res.status(500).json({ success: false, error: 'Failed to process video' });
  }
});

// ✅ Download endpoint (Cobalt v10)
app.get('/api/download', async (req, res) => {
  try {
    const { videoId } = req.query;
    const quality = normalizeQuality(req.query.quality);

    if (!videoId) return res.status(400).json({ error: 'Video ID required' });
    if (!COBALT_BASE_URL) {
      return res.status(500).json({
        error: 'Server is missing COBALT_BASE_URL. Set it in Render env vars to your own cobalt instance URL.',
      });
    }

    // Cobalt v10: POST "/" (root). Required headers. :contentReference[oaicite:3]{index=3}
    const cobaltEndpoint = `${COBALT_BASE_URL}/`;

    // IMPORTANT:
    // Send ONLY valid keys. Keep it minimal to avoid "invalid_body". :contentReference[oaicite:4]{index=4}
    const cobaltBody = {
      url: `https://www.youtube.com/watch?v=${String(videoId)}`,
      videoQuality: String(quality), // must be string like "1080", not "1080p" :contentReference[oaicite:5]{index=5}
      downloadMode: 'auto',
      filenameStyle: 'basic',
      // Optional YouTube keys (also valid)
      youtubeVideoCodec: 'h264',
      youtubeVideoContainer: 'auto',
    };

    const cobaltResp = await axios.post(cobaltEndpoint, cobaltBody, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 60000,
      validateStatus: () => true,
    });

    const data = cobaltResp.data;

    // If cobalt returned non-json (rare), show it
    if (!data || typeof data !== 'object') {
      return res.status(502).json({
        error: 'Cobalt returned unexpected response',
        debug: { cobalt: COBALT_BASE_URL, status: cobaltResp.status, body: String(data).slice(0, 300) },
      });
    }

    // success cases
    if (data.status === 'tunnel' || data.status === 'redirect') {
      const out = absCobaltUrl(data.url);
      return res.redirect(out);
    }

    if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length > 0) {
      const picked = data.picker.find((p) => p && p.url) || data.picker[0];
      const out = absCobaltUrl(picked.url);
      return res.redirect(out);
    }

    // error case
    if (data.status === 'error') {
      return res.status(400).json({
        error: 'Failed to generate download link. Please try again.',
        debug: { cobalt: COBALT_BASE_URL, status: cobaltResp.status, body: data },
      });
    }

    // other status
    return res.status(400).json({
      error: 'Unsupported cobalt response',
      debug: { cobalt: COBALT_BASE_URL, status: cobaltResp.status, body: data },
    });
  } catch (error) {
    console.error('download error:', error?.response?.data || error?.message || error);
    return res.status(500).json({
      error: 'Failed to generate download link. Please try again.',
      debug: { message: error?.message || String(error) },
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`🧩 COBALT_BASE_URL: ${COBALT_BASE_URL || '(missing)'}`);
});

module.exports = app;
