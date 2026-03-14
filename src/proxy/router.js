const express = require('express');
const axios = require('axios');
const { v4: uuid } = require('uuid');
const { compress } = require('../compress/engine');
const { countTokens } = require('../compress/tokenizer');

function createProxyRouter(storage) {
  const router = express.Router();

  router.post('/chat/completions', async (req, res) => {
    const startTime = Date.now();
    const requestId = uuid();
    
    try {
      const { messages, model, ...rest } = req.body;
      
      // Count original tokens
      const originalTokens = await countTokens(messages);
      
      // Compress context
      const { messages: compressed, stats } = await compress(messages);
      const compressedTokens = await countTokens(compressed);
      
      // Determine provider
      const isAnthropic = model?.startsWith('claude');
      const baseURL = isAnthropic 
        ? 'https://api.anthropic.com/v1'
        : 'https://api.openai.com/v1';
      const apiKey = isAnthropic
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;

      // Forward request
      let response;
      if (isAnthropic) {
        // Convert to Anthropic format
        const system = compressed.filter(m => m.role === 'system').map(m => m.content).join('\n');
        const msgs = compressed.filter(m => m.role !== 'system');
        response = await axios.post(`${baseURL}/messages`, {
          model, system, messages: msgs, max_tokens: rest.max_tokens || 4096, ...rest
        }, {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        });
      } else {
        response = await axios.post(`${baseURL}/chat/completions`, {
          model, messages: compressed, ...rest
        }, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
      }

      // Record stats
      const saved = originalTokens - compressedTokens;
      await storage.record({
        id: requestId,
        timestamp: Date.now(),
        model,
        originalTokens,
        compressedTokens,
        savedTokens: saved,
        savingsPercent: ((saved / originalTokens) * 100).toFixed(1),
        latencyMs: Date.now() - startTime,
        ...stats
      });

      // Return response with savings header
      res.set('X-Tokens-Original', originalTokens);
      res.set('X-Tokens-Compressed', compressedTokens);
      res.set('X-Tokens-Saved', saved);
      res.json(response.data);
      
    } catch (err) {
      console.error(`[${requestId}] Error:`, err.response?.data || err.message);
      res.status(err.response?.status || 500).json({
        error: { message: err.response?.data?.error?.message || err.message }
      });
    }
  });

  // Models passthrough
  router.get('/models', async (req, res) => {
    try {
      const r = await axios.get('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      res.json(r.data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createProxyRouter };
