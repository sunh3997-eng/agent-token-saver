let encoder = null;

async function getEncoder() {
  if (!encoder) {
    const { encoding_for_model } = require('tiktoken');
    encoder = encoding_for_model('gpt-4o');
  }
  return encoder;
}

async function countTokens(messages) {
  const enc = await getEncoder();
  let total = 0;
  for (const msg of messages) {
    total += 4; // message overhead
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    total += enc.encode(content).length;
    if (msg.role) total += enc.encode(msg.role).length;
  }
  return total + 2; // reply priming
}

module.exports = { countTokens };
