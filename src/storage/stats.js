const { hincrby, hgetall, lpush, lrange, ltrim } = require('./redis');

const STATS_KEY = 'ats:stats';
const REQUESTS_KEY = 'ats:requests';
const MAX_RECENT_REQUESTS = 100;

async function recordRequest(data) {
  const {
    provider,
    model,
    originalTokens,
    compressedTokens,
    saved,
    compressionRatio,
    duration,
    timestamp = Date.now(),
  } = data;

  await Promise.all([
    hincrby(STATS_KEY, 'total_requests', 1),
    hincrby(STATS_KEY, 'total_original_tokens', originalTokens),
    hincrby(STATS_KEY, 'total_compressed_tokens', compressedTokens),
    hincrby(STATS_KEY, 'total_tokens_saved', saved),
  ]);

  const record = {
    provider,
    model: model || 'unknown',
    originalTokens,
    compressedTokens,
    saved,
    compressionRatio: Math.round(compressionRatio * 100),
    duration,
    timestamp,
  };

  await lpush(REQUESTS_KEY, record);
  await ltrim(REQUESTS_KEY, 0, MAX_RECENT_REQUESTS - 1);
}

async function getStats() {
  const [raw, recentRequests] = await Promise.all([
    hgetall(STATS_KEY),
    lrange(REQUESTS_KEY, 0, 19),
  ]);

  const totalRequests = parseInt(raw.total_requests) || 0;
  const totalOriginal = parseFloat(raw.total_original_tokens) || 0;
  const totalCompressed = parseFloat(raw.total_compressed_tokens) || 0;
  const totalSaved = parseFloat(raw.total_tokens_saved) || 0;

  const avgCompressionRatio = totalOriginal > 0
    ? Math.round((totalSaved / totalOriginal) * 100)
    : 0;

  // Estimate cost savings (using GPT-4 price as baseline: $10/1M input tokens)
  const costSavingsUsd = (totalSaved / 1_000_000) * 10;

  return {
    summary: {
      totalRequests,
      totalOriginalTokens: Math.round(totalOriginal),
      totalCompressedTokens: Math.round(totalCompressed),
      totalTokensSaved: Math.round(totalSaved),
      avgCompressionRatio,
      estimatedCostSavingsUsd: costSavingsUsd.toFixed(4),
    },
    recentRequests,
  };
}

module.exports = { recordRequest, getStats };
