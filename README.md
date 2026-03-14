# Agent Token Saver ⚡

LLM API proxy gateway that automatically compresses agent context to reduce token consumption by 30-50%.

## How It Works

1. **Drop-in proxy** — Point your OpenAI/Anthropic SDK to `http://localhost:4000/v1` instead of the official API
2. **Auto-compression** — Deduplicates system prompts, trims old messages, summarizes conversation history
3. **Track savings** — Dashboard at `:4001` shows real-time token savings and request history

## Quick Start

```bash
cp .env.example .env
# Edit .env with your API keys

npm install
npm start
# Proxy: http://localhost:4000
# Dashboard: http://localhost:4001
```

### Docker

```bash
docker build -t agent-token-saver .
docker run -p 4000:4000 -p 4001:4001 --env-file .env agent-token-saver
```

## Usage

Replace your API base URL:

```python
import openai
client = openai.OpenAI(base_url="http://localhost:4000/v1")
# Everything else stays the same!
```

Response headers include savings info:
- `X-Tokens-Original` — original token count
- `X-Tokens-Compressed` — after compression
- `X-Tokens-Saved` — tokens saved

## Architecture

```
Client → [Proxy Gateway] → [Compression Engine] → [LLM API]
              ↓                     ↓
         [Stats API]          [Redis Cache]
              ↓
         [Dashboard]
```

## Compression Strategies

1. **Dedup** — Remove duplicate system prompts (common in agent loops)
2. **Trim** — Keep only last N message pairs, summarize the rest
3. **Summarize** — Use a cheap model (gpt-4o-mini) to condense old context

## License

MIT
