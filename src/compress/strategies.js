const { countTokens } = require('./tokenizer');

const MAX_TOOL_RESULT_TOKENS = parseInt(process.env.MAX_TOOL_RESULT_TOKENS) || 500;

/**
 * Remove exact duplicate messages
 */
function deduplicateMessages(messages) {
  const seen = new Set();
  return messages.filter(msg => {
    const key = `${msg.role}:${JSON.stringify(msg.content)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Normalize whitespace in text content (strips excessive blank lines, trailing spaces)
 */
function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')       // trailing whitespace per line
    .replace(/\n{3,}/g, '\n\n')     // max 2 consecutive newlines
    .trim();
}

/**
 * Apply whitespace normalization to all messages
 */
function normalizeMessages(messages) {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { ...msg, content: normalizeWhitespace(msg.content) };
    }
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map(block => {
          if (block.type === 'text' && typeof block.text === 'string') {
            return { ...block, text: normalizeWhitespace(block.text) };
          }
          return block;
        }),
      };
    }
    return msg;
  });
}

/**
 * Truncate tool/function results that exceed the token limit
 */
function truncateToolResults(messages) {
  return messages.map(msg => {
    // OpenAI format: role=tool with content string
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      const tokens = countTokens(msg.content);
      if (tokens > MAX_TOOL_RESULT_TOKENS) {
        const truncated = truncateToTokens(msg.content, MAX_TOOL_RESULT_TOKENS);
        return {
          ...msg,
          content: truncated + `\n\n[Truncated: ${tokens - MAX_TOOL_RESULT_TOKENS} tokens removed]`,
        };
      }
    }

    // Anthropic format: tool_result blocks
    if (Array.isArray(msg.content)) {
      const newContent = msg.content.map(block => {
        if (block.type === 'tool_result' && typeof block.content === 'string') {
          const tokens = countTokens(block.content);
          if (tokens > MAX_TOOL_RESULT_TOKENS) {
            const truncated = truncateToTokens(block.content, MAX_TOOL_RESULT_TOKENS);
            return {
              ...block,
              content: truncated + `\n\n[Truncated: ${tokens - MAX_TOOL_RESULT_TOKENS} tokens removed]`,
            };
          }
        }
        return block;
      });
      return { ...msg, content: newContent };
    }

    return msg;
  });
}

/**
 * Rolling window: keep last N messages, summarize older ones
 */
function applyRollingWindow(messages, maxWindow) {
  if (messages.length <= maxWindow) return messages;

  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  if (nonSystem.length <= maxWindow) return messages;

  const older = nonSystem.slice(0, nonSystem.length - maxWindow);
  const recent = nonSystem.slice(nonSystem.length - maxWindow);

  // Build a compact summary of the older messages
  const summaryLines = older.map(msg => {
    const content = typeof msg.content === 'string'
      ? msg.content
      : extractTextFromContent(msg.content);
    const preview = content.slice(0, 200) + (content.length > 200 ? '...' : '');
    return `[${msg.role}]: ${preview}`;
  });

  const summary = {
    role: 'system',
    content: `[CONVERSATION HISTORY SUMMARY - ${older.length} earlier messages]\n${summaryLines.join('\n')}\n[END SUMMARY]`,
  };

  return [...systemMessages, summary, ...recent];
}

/**
 * Truncate text to approximately N tokens
 */
function truncateToTokens(text, maxTokens) {
  // Rough estimate: 4 chars per token
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/**
 * Extract plain text from Anthropic-style content blocks
 */
function extractTextFromContent(content) {
  if (!Array.isArray(content)) return String(content);
  return content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join(' ');
}

module.exports = {
  deduplicateMessages,
  normalizeMessages,
  truncateToolResults,
  applyRollingWindow,
};
