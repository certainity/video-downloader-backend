const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const COBALT_BASE_URL_RAW = process.env.COBALT_BASE_URL || '';
const COBALT_BASE_URL = COBALT_BASE_URL_RAW.replace(/\/+$/, ''); // remove trailing slashes

function absolutizeCobaltUrl(maybeRelativeUrl) {
  if (!maybeRelativeUrl) return '';
  if (/^https?:\/\//i.test(maybeRelativeUrl)) return maybeRelativeUrl;
  if (maybeRelativeUrl.startsWith('/')) return `${COBALT_BASE_URL}${maybeRelativeUrl}`;
  return `${COBALT_BASE_URL}/${maybeRelativeUrl}`;
}

function cleanQuality(q) {
  if (!q) return '1080';
  const s = String(q).trim().toLowerCase().replace('p', '');
  // allow only values supported by cobalt schema
  const allowed = new Set(['max','4320','2160','1440','1080','720','480','360','240','144']);
  return allowed.has(s) ? s : '1080';
}

function detectPlatform(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes('youtube') || h.includes('youtu.be')) return 'YouTube';
    if (h.includes('instagram')) return 'Instagram';
    if (h.includes('facebook') || h.includes('fb.')) return 'Facebook';
    if (h.includes('tiktok')) return 'TikTok';
    if (h.includes('twitter') || h.includes('x.com')) return 'Twitter/X';
    if (h.includes('snapchat')) return 'Snapchat';
    return h;
  } catch {
    return 'Unknown';
  }
}

// Health
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    cobaltConfigured: Boolean(COBALT_BASE_URL),
    cobaltBaseUrl: COBALT_BASE_URL || null,
  });
});

// Fetch basic info (best-effort) + build quality buttons
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Best-effort metadata via noembed (works for many sites, not guaranteed)
    let title = 'Video';
    let thumbnail = 'https://via.placeholder.com/480x270/667eea/ffffff?text=Video';
    let author = '';

    try {
      const o = await axios.get(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, { timeout: 10000 });
      if (o.data) {
        if (o.data.title) title = o.data.title;
        if (o.data.thumbnail_url) thumbnail = o.data.thumbnail_url;
        if (o.data.author_name) author = o.data.author_name;
      }
    } catch {
      // ignore noembed failures
    }

    const qualities = ['1080', '720', '480', '360'].map((q) => ({
      quality: `${q}p`,
      format: 'mp4',
      url: `/api/download?url=${encodeURIComponent(url)}&quality=${q}`,
      directDownload: true,
    }));

    return res.json({
      success: true,
      platform: detectPlatform(url),
      title,
      thumbnail,
      author: author || undefined,
      duration: '—',
      qualities,
      note: 'If a platform blocks downloads, try a different link or platform. Some sites (like YouTube) may be restricted on cloud hosting.',
    });
  } catch (err) {
    console.error('video-info error:', err?.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Download endpoint -> asks YOUR cobalt instance to generate a tunnel/redirect
app.get('/api/download', async (req, res) => {
  try {
    if (!COBALT_BASE_URL) {
      return res.status(500).json({
        error: 'Server is missing COBALT_BASE_URL. Set it in Render env vars to your own cobalt instance URL.',
      });
    }

    // Support both new param (url) and old (videoId)
    const { url, videoId } = req.query;
    const quality = cleanQuality(req.query.quality);

    let sourceUrl = '';
    if (url) {
      sourceUrl = String(url);
    } else if (videoId) {
      sourceUrl = `https://www.youtube.com/watch?v=${String(videoId)}`;
    } else {
      return res.status(400).json({ error: 'Missing url (or videoId)' });
    }

    // IMPORTANT: current Cobalt API endpoint is POST "/" (not /api/json) :contentReference[oaicite:9]{index=9}
    const cobaltEndpoint = `${COBALT_BASE_URL}/`;

    // Body must match cobalt schema :contentReference[oaicite:10]{index=10}
    const body = {
      url: sourceUrl,
      videoQuality: quality,            // "1080" not "1080p" :contentReference[oaicite:11]{index=11}
      downloadMode: 'auto',             // auto/audio/mute :contentReference[oaicite:12]{index=12}
      filenameStyle: 'basic',           // classic/pretty/basic/nerdy :contentReference[oaicite:13]{index=13}
      alwaysProxy: true,                // try to force tunnel more often :contentReference[oaicite:14]{index=14}
      localProcessing: 'disabled',      // prefer server-side :contentReference[oaicite:15]{index=15}

      // YouTube-specific (optional but valid) :contentReference[oaicite:16]{index=16}
      youtubeVideoCodec: 'h264',
      youtubeVideoContainer: 'mp4',
    };

    const cobaltResp = await axios.post(cobaltEndpoint, body, {
      headers: {
        Accept: 'application/json',         // required :contentReference[oaicite:17]{index=17}
        'Content-Type': 'application/json', // required :contentReference[oaicite:18]{index=18}
      },
      timeout: 60000,
      validateStatus: () => true,
    });

    const data = cobaltResp.data;

    // Handle non-JSON/HTML errors safely
    if (!data || typeof data !== 'object') {
      return res.status(502).json({
        error: 'Cobalt returned an unexpected response',
        debug: { status: cobaltResp.status, body: String(data).slice(0, 500) },
      });
    }

    if (data.status === 'error') {
      // Example: error.api.youtube.login
      return res.status(400).json({
        error: 'Failed to generate download link. Please try again.',
        debug: { cobalt: COBALT_BASE_URL, status: cobaltResp.status, body: data },
      });
    }

    if (data.status === 'redirect' || data.status === 'tunnel') {
      const out = absolutizeCobaltUrl(data.url);
      return res.redirect(out);
    }

    if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length > 0) {
      const out = absolutizeCobaltUrl(data.picker[0].url);
      return res.redirect(out);
    }

    if (data.status === 'local-processing') {
      // Your backend currently doesn't do local merging/remuxing.
      return res.status(409).json({
        error: 'This media requires local processing (merge/remux). Server cannot complete it automatically.',
        debug: { cobalt: COBALT_BASE_URL, body: data },
      });
    }

    return res.status(502).json({
      error: 'Unsupported cobalt response',
      debug: { cobalt: COBALT_BASE_URL, body: data },
    });
  } catch (error) {
    console.error('download error:', error?.message);
    return res.status(500).json({
      error: 'Failed to generate download link. Please try again.',
      debug: { message: error?.message },
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
});

module.exports = app;
