const express = require('express');
const router = express.Router();

const openaiProxy = require('./openai');
const anthropicProxy = require('./anthropic');

// OpenAI-compatible endpoints
router.post('/chat/completions', openaiProxy.chatCompletions);
router.post('/completions', openaiProxy.completions);

// Anthropic-compatible endpoint
router.post('/messages', anthropicProxy.messages);

// Pass through other routes (embeddings, models, etc.)
router.use('*', async (req, res) => {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.method} ${req.originalUrl} not proxied. Use /v1/chat/completions or /v1/messages.`,
      type: 'invalid_request_error',
    },
  });
});

module.exports = router;
