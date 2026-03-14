const axios = require('axios');
const { compress } = require('../compress');
const { recordRequest } = require('../storage/stats');

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com';

async function chatCompletions(req, res) {
  const startTime = Date.now();
  const apiKey = req.headers['authorization'] || `Bearer ${process.env.OPENAI_API_KEY}`;

  if (!apiKey) {
    return res.status(401).json({ error: { message: 'Missing API key', type: 'authentication_error' } });
  }

  const body = req.body;
  const messages = body.messages || [];
  const model = body.model || 'gpt-4';
  const streaming = body.stream === true;

  // Compress messages
  const { messages: compressedMessages, stats } = compress(messages);
  const compressedBody = { ...body, messages: compressedMessages };

  try {
    if (streaming) {
      // Stream response passthrough
      const upstream = await axios.post(
        `${OPENAI_BASE_URL}/v1/chat/completions`,
        compressedBody,
        {
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          timeout: 120000,
        }
      );

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Tokens-Saved', stats.saved);
      res.setHeader('X-Compression-Ratio', Math.round(stats.compressionRatio * 100));

      upstream.data.pipe(res);

      upstream.data.on('end', async () => {
        await recordRequest({
          provider: 'openai',
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
        `${OPENAI_BASE_URL}/v1/chat/completions`,
        compressedBody,
        {
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      );

      await recordRequest({
        provider: 'openai',
        model,
        originalTokens: stats.originalTokens,
        compressedTokens: stats.compressedTokens,
        saved: stats.saved,
        compressionRatio: stats.compressionRatio,
        duration: Date.now() - startTime,
      });

      // Add compression headers
      res.setHeader('X-Tokens-Saved', stats.saved);
      res.setHeader('X-Compression-Ratio', Math.round(stats.compressionRatio * 100));
      res.setHeader('X-Original-Tokens', stats.originalTokens);
      res.setHeader('X-Applied-Strategies', (stats.appliedStrategies || []).join(','));

      res.json(response.data);
    }
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || { error: { message: err.message } };
    console.error(`OpenAI proxy error: ${status} ${err.message}`);
    res.status(status).json(data);
  }
}

async function completions(req, res) {
  // Legacy completions endpoint - just proxy through
  const apiKey = req.headers['authorization'] || `Bearer ${process.env.OPENAI_API_KEY}`;

  try {
    const response = await axios.post(
      `${OPENAI_BASE_URL}/v1/completions`,
      req.body,
      {
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        timeout: 120000,
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
}

module.exports = { chatCompletions, completions };
