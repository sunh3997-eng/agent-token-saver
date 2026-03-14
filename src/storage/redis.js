const { createClient } = require('redis');

async function createStorage() {
  let client;
  try {
    client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    await client.connect();
    console.log('✅ Redis connected');
  } catch (e) {
    console.warn('⚠️ Redis unavailable, using in-memory storage');
    client = null;
  }

  // In-memory fallback
  const mem = [];

  return {
    async record(entry) {
      if (client) {
        await client.lPush('token-saver:requests', JSON.stringify(entry));
        await client.incrByFloat('token-saver:total-saved', entry.savedTokens);
        await client.incr('token-saver:total-requests');
      } else {
        mem.push(entry);
      }
    },

    async getStats() {
      if (client) {
        const totalSaved = parseFloat(await client.get('token-saver:total-saved') || '0');
        const totalRequests = parseInt(await client.get('token-saver:total-requests') || '0');
        const recent = (await client.lRange('token-saver:requests', 0, 49)).map(JSON.parse);
        
        const totalOriginal = recent.reduce((s, r) => s + r.originalTokens, 0);
        const totalCompressed = recent.reduce((s, r) => s + r.compressedTokens, 0);
        
        return {
          totalRequests,
          totalTokensSaved: totalSaved,
          avgSavingsPercent: totalOriginal > 0 ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(1) : 0,
          recentRequests: recent.slice(0, 20)
        };
      }
      
      const totalOriginal = mem.reduce((s, r) => s + r.originalTokens, 0);
      const totalCompressed = mem.reduce((s, r) => s + r.compressedTokens, 0);
      return {
        totalRequests: mem.length,
        totalTokensSaved: mem.reduce((s, r) => s + r.savedTokens, 0),
        avgSavingsPercent: totalOriginal > 0 ? ((1 - totalCompressed / totalOriginal) * 100).toFixed(1) : 0,
        recentRequests: mem.slice(-20).reverse()
      };
    }
  };
}

module.exports = { createStorage };
