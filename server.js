const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * IMPORTANT:
 * Set this in Render env vars for your BACKEND service:
 *   COBALT_BASE_URL=https://cobalt-10-ikmn.onrender.com
 *
 * If not set, it falls back to public cobalt.
 */
const COBALT_BASE_URL = (process.env.COBALT_BASE_URL || 'https://api.cobalt.tools')
  .replace(/\/+$/, '');
const COBALT_API_JSON = `${COBALT_BASE_URL}/api/json`;

app.use(cors());
app.use(express.json());

const extractVideoId = (url) => {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([^&\n?#]+)/
  );
  return match ? match[1] : null;
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Video Downloader API is running',
    cobalt: COBALT_BASE_URL,
  });
});

// Get video info + qualities (UI)
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

    // Get basic metadata via oEmbed (fast + no key needed)
    // Works for many public YouTube videos.
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

    let info;
    try {
      const r = await axios.get(oembedUrl, { timeout: 10000 });
      info = r.data;
    } catch (e) {
      // If oEmbed fails, still return basic structure so UI can continue
      info = {
        title: 'Video',
        author_name: '',
        thumbnail_url: 'https://via.placeholder.com/480x270/667eea/ffffff?text=Video',
      };
    }

    return res.json({
      success: true,
      platform: 'YouTube',
      videoId,
      title: info.title || 'Video',
      author: info.author_name || '',
      thumbnail: info.thumbnail_url || 'https://via.placeholder.com/480x270/667eea/ffffff?text=Video',
      qualities: [
        { quality: '1080p', format: 'mp4', url: `/api/download?videoId=${videoId}&quality=1080`, directDownload: true },
        { quality: '720p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=720`,  directDownload: true },
        { quality: '480p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=480`,  directDownload: true },
        { quality: '360p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=360`,  directDownload: true },
      ],
      downloadUrl: `/api/download?videoId=${videoId}&quality=1080`,
      method: 'direct',
      note: `Downloads powered by your Cobalt: ${COBALT_BASE_URL}`,
    });
  } catch (error) {
    console.error('video-info error:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process video',
    });
  }
});

// Download endpoint -> asks Cobalt for a download link, then redirects user to file
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, quality } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }

    // Ask cobalt
    const cobaltPayload = {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      vCodec: 'h264',
      vQuality: String(quality || '1080'),
      isAudioOnly: false,
    };

    const cobaltResp = await axios.post(COBALT_API_JSON, cobaltPayload, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 60000,
      // IMPORTANT: don't throw on 4xx/5xx; we want the body for debugging
      validateStatus: () => true,
    });

    const data = cobaltResp.data;

    // Cobalt success cases
    if (data && (data.status === 'redirect' || data.status === 'tunnel') && data.url) {
      return res.redirect(data.url);
    }

    if (data && data.status === 'picker' && Array.isArray(data.picker) && data.picker.length > 0) {
      return res.redirect(data.picker[0].url);
    }

    // Cobalt error case -> return full debug (this is what you pasted)
    return res.status(400).json({
      error: 'Failed to generate download link. Please try again.',
      debug: {
        cobalt: COBALT_BASE_URL,
        status: cobaltResp.status,
        body: data,
      },
    });
  } catch (error) {
    console.error('download error:', error?.message || error);
    return res.status(500).json({
      error: 'Failed to generate download link. Please try again.',
      debug: {
        cobalt: COBALT_BASE_URL,
        message: error?.message || String(error),
      },
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Video Downloader API running on port ${PORT}`);
  console.log(`🧩 Using cobalt at: ${COBALT_API_JSON}`);
});
