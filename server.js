require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Set this in Render backend env vars:
// COBALT_BASE_URL=https://cobalt-10-ikmn.onrender.com
const COBALT_BASE_URL = (process.env.COBALT_BASE_URL || '').replace(/\/+$/, '');

app.use(cors());
app.use(express.json());

// Helper: extract YouTube video ID
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
    cobalt: COBALT_BASE_URL || '(missing COBALT_BASE_URL)',
  });
});

// Get video info (for UI)
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

    // Lightweight metadata via oEmbed
    let videoInfo = null;
    try {
      const r = await axios.get(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { timeout: 10000 }
      );
      videoInfo = r.data;
    } catch (e) {
      // ignore oEmbed failure
    }

    return res.json({
      success: true,
      platform: 'YouTube',
      title: videoInfo?.title || 'YouTube Video',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: 'Available',
      author: videoInfo?.author_name || 'YouTube Channel',
      videoId,
      qualities: [
        { quality: '1080p', format: 'mp4', url: `/api/download?videoId=${videoId}&quality=1080`, directDownload: true },
        { quality: '720p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=720`,  directDownload: true },
        { quality: '480p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=480`,  directDownload: true },
        { quality: '360p',  format: 'mp4', url: `/api/download?videoId=${videoId}&quality=360`,  directDownload: true },
      ],
      downloadUrl: `/api/download?videoId=${videoId}&quality=1080`,
      method: 'cobalt',
    });
  } catch (error) {
    console.error('video-info error:', error?.message || error);
    res.status(500).json({ success: false, error: 'Failed to process video' });
  }
});

// ✅ Download endpoint (FIXED for Cobalt v10)
app.get('/api/download', async (req, res) => {
  try {
    const { videoId, quality } = req.query;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }

    if (!COBALT_BASE_URL) {
      return res.status(500).json({
        error: 'Server is missing COBALT_BASE_URL. Set it in Render env vars.',
      });
    }

    // Cobalt v10 endpoint is POST /
    const cobaltEndpoint = `${COBALT_BASE_URL}/`;

    // Convert "1080" -> valid quality string
    const q = String(quality || '1080').replace(/[^\d]/g, '');
    const videoQuality = ['4320','2160','1440','1080','720','480','360','240','144'].includes(q) ? q : '1080';

    const cobaltResp = await axios.post(
      cobaltEndpoint,
      {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoQuality,
        youtubeVideoCodec: 'h264',
        youtubeVideoContainer: 'mp4',
        downloadMode: 'auto',
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        validateStatus: () => true,
      }
    );

    const data = cobaltResp.data;

    // Success: redirect/tunnel
    if (data && (data.status === 'redirect' || data.status === 'tunnel')) {
      const target =
        typeof data.url === 'string' && data.url.startsWith('/')
          ? `${COBALT_BASE_URL}${data.url}`
          : data.url;

      if (!target) {
        return res.status(502).json({ error: 'Cobalt returned no URL', debug: data });
      }

      return res.redirect(target);
    }

    // Picker: choose best available
    if (data && data.status === 'picker' && Array.isArray(data.picker) && data.picker.length > 0) {
      const picked =
        data.picker.find((p) => p.type === 'video' && p.url) ||
        data.picker.find((p) => p.url) ||
        data.picker[0];

      const target =
        typeof picked.url === 'string' && picked.url.startsWith('/')
          ? `${COBALT_BASE_URL}${picked.url}`
          : picked.url;

      if (!target) {
        return res.status(502).json({ error: 'Cobalt picker had no usable URL', debug: data });
      }

      return res.redirect(target);
    }

    // Local-processing means it wants client-side remux
    if (data && data.status === 'local-processing') {
      return res.status(501).json({
        error: 'This download requires local processing (merge/remux). Not supported yet.',
        debug: data,
      });
    }

    // Error response from cobalt
    return res.status(400).json({
      error: 'Failed to generate download link. Please try again.',
      debug: {
        cobalt: COBALT_BASE_URL,
        status: cobaltResp.status,
        body: data,
      },
    });
  } catch (error) {
    console.error('download error:', error?.response?.data || error?.message || error);
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
  console.log(`🧩 COBALT_BASE_URL = ${COBALT_BASE_URL || '(missing)'}`);
});

module.exports = app;
