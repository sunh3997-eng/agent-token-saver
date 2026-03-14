const axios = require('axios');
const { compress } = require('../compress');
const { recordRequest } = require('../storage/stats');

const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

async function messages(req, res) {
  const startTime = Date.now();
  const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(401).json({
      type: 'error',
      error: { type: 'authentication_error', message: 'Missing API key' },
    });
  }

  const body = req.body;
  const msgs = body.messages || [];
  const model = body.model || 'claude-opus-4-6';
  const streaming = body.stream === true;

  // Compress messages (Anthropic format compatible)
  const { messages: compressedMessages, stats } = compress(msgs);
  const compressedBody = { ...body, messages: compressedMessages };

  try {
    const headers = {
      'x-api-key': apiKey,
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      'content-type': 'application/json',
    };

    // Forward any anthropic-beta headers
    if (req.headers['anthropic-beta']) {
      headers['anthropic-beta'] = req.headers['anthropic-beta'];
    }

    if (streaming) {
      const upstream = await axios.post(
        `${ANTHROPIC_BASE_URL}/v1/messages`,
        compressedBody,
        { headers, responseType: 'stream', timeout: 120000 }
      );

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Tokens-Saved', stats.saved);
      res.setHeader('X-Compression-Ratio', Math.round(stats.compressionRatio * 100));

      upstream.data.pipe(res);

      upstream.data.on('end', async () => {
        await recordRequest({
          provider: 'anthropic',
          model,
          originalTokens: stats.originalTokens,
          compressedTokens: stats.compressedTokens,
          saved: stats.saved,
          compressionRatio: stats.compressionRatio,
          duration: Date.now() - startTime,
        });
      });
    } else {
      const response = await axios.post(
        `${ANTHROPIC_BASE_URL}/v1/messages`,
        compressedBody,
        { headers, timeout: 120000 }
      );

      await recordRequest({
        provider: 'anthropic',
        model,
        originalTokens: stats.originalTokens,
        compressedTokens: stats.compressedTokens,
        saved: stats.saved,
        compressionRatio: stats.compressionRatio,
        duration: Date.now() - startTime,
      });

      res.setHeader('X-Tokens-Saved', stats.saved);
      res.setHeader('X-Compression-Ratio', Math.round(stats.compressionRatio * 100));
      res.setHeader('X-Original-Tokens', stats.originalTokens);

      res.json(response.data);
    }
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || { type: 'error', error: { type: 'api_error', message: err.message } };
    console.error(`Anthropic proxy error: ${status} ${err.message}`);
    res.status(status).json(data);
  }
}

module.exports = { messages };
