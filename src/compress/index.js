const {
  deduplicateMessages,
  normalizeMessages,
  truncateToolResults,
  applyRollingWindow,
} = require('./strategies');
const { countMessageTokens } = require('./tokenizer');

const COMPRESSION_ENABLED = process.env.COMPRESSION_ENABLED !== 'false';
const COMPRESSION_THRESHOLD = parseInt(process.env.COMPRESSION_THRESHOLD) || 1000;
const MAX_MESSAGES_WINDOW = parseInt(process.env.MAX_MESSAGES_WINDOW) || 20;

/**
 * Compress messages to reduce token consumption.
 * Returns { messages, stats }
 */
function compress(messages, options = {}) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { messages, stats: { originalTokens: 0, compressedTokens: 0, saved: 0, compressionRatio: 0, skipped: true } };
  }

  const originalTokens = countMessageTokens(messages);

  // Skip compression if disabled or under threshold
  if (!COMPRESSION_ENABLED || originalTokens < COMPRESSION_THRESHOLD) {
    return {
      messages,
      stats: {
        originalTokens,
        compressedTokens: originalTokens,
        saved: 0,
        compressionRatio: 0,
        skipped: true,
        reason: !COMPRESSION_ENABLED ? 'disabled' : 'below_threshold',
      },
    };
  }

  let compressed = messages;
  const appliedStrategies = [];

  // Strategy 1: Normalize whitespace
  compressed = normalizeMessages(compressed);
  appliedStrategies.push('normalize_whitespace');

  // Strategy 2: Deduplicate messages
  const beforeDedup = compressed.length;
  compressed = deduplicateMessages(compressed);
  if (compressed.length < beforeDedup) {
    appliedStrategies.push('deduplication');
  }

  // Strategy 3: Truncate tool results
  compressed = truncateToolResults(compressed);
  appliedStrategies.push('truncate_tool_results');

  // Strategy 4: Rolling window (only for longer conversations)
  const maxWindow = options.maxWindow || MAX_MESSAGES_WINDOW;
  if (compressed.length > maxWindow) {
    compressed = applyRollingWindow(compressed, maxWindow);
    appliedStrategies.push('rolling_window');
  }

  const compressedTokens = countMessageTokens(compressed);
  const saved = Math.max(0, originalTokens - compressedTokens);
  const compressionRatio = originalTokens > 0 ? saved / originalTokens : 0;

  return {
    messages: compressed,
    stats: {
      originalTokens,
      compressedTokens,
      saved,
      compressionRatio,
      skipped: false,
      appliedStrategies,
    },
  };
}

module.exports = { compress };
