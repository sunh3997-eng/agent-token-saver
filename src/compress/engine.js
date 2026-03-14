const axios = require('axios');

/**
 * Context compression engine.
 * Strategies:
 * 1. Dedup: remove duplicate system prompts
 * 2. Trim: drop old assistant messages beyond window
 * 3. Summarize: condense old conversation into summary (uses cheap model)
 */

const WINDOW_SIZE = 10; // keep last N message pairs
const THRESHOLD = parseInt(process.env.COMPRESSION_THRESHOLD || '4000');

function dedup(messages) {
  const seen = new Set();
  return messages.filter(m => {
    if (m.role === 'system') {
      const key = m.content?.substring(0, 200);
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });
}

function trimOld(messages) {
  const system = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');
  if (nonSystem.length <= WINDOW_SIZE * 2) return messages;
  const kept = nonSystem.slice(-WINDOW_SIZE * 2);
  const trimmed = nonSystem.slice(0, -WINDOW_SIZE * 2);
  return { system, kept, trimmed };
}

async function summarize(messages) {
  const model = process.env.SUMMARY_MODEL || 'gpt-4o-mini';
  const text = messages.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n');
  
  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model,
      messages: [
        { role: 'system', content: 'Summarize this conversation concisely, preserving key facts, decisions, and context needed for continuation. Be brief.' },
        { role: 'user', content: text }
      ],
      max_tokens: 500
    }, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
    });
    return res.data.choices[0].message.content;
  } catch (e) {
    // Fallback: just take first and last messages
    return `[Previous conversation summary: ${messages.length} messages discussing ${messages[0]?.content?.substring(0, 100)}...]`;
  }
}

async function compress(messages) {
  if (!messages || messages.length === 0) return { messages, compressed: false, stats: {} };
  
  // Step 1: Dedup system prompts
  let result = dedup(messages);
  const afterDedup = result.length;
  
  // Step 2: Trim + summarize old messages
  const trimResult = trimOld(result);
  if (trimResult.trimmed) {
    const summary = await summarize(trimResult.trimmed);
    result = [
      ...trimResult.system,
      { role: 'system', content: `[Conversation summary]: ${summary}` },
      ...trimResult.kept
    ];
  }
  
  return {
    messages: result,
    compressed: result.length < messages.length,
    stats: {
      originalMessages: messages.length,
      compressedMessages: result.length,
      dedupRemoved: messages.length - afterDedup,
      summarized: !!trimResult.trimmed
    }
  };
}

module.exports = { compress, dedup, trimOld, summarize };
