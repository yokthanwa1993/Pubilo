# Pubilo - Facebook Auto-Post Platform

Cloudflare Workers-based platform for automating Facebook page posts with AI-generated content.

## Architecture

```
├── worker/          # Main API (api.pubilo.com) - Cloudflare Worker
├── public/          # Frontend (www.pubilo.com) - Cloudflare Pages
├── extension/       # Chrome Extension for FB token capture
└── scripts/         # Development utilities
```

## Services

| Service | URL | Description |
|---------|-----|-------------|
| **API** | `api.pubilo.com` | Main Hono Worker (D1, R2) |
| **Frontend** | `www.pubilo.com` | Static frontend (Pages) |
| **OG Image** | `og.pubilo.com` | OG Image generator (PNG) |

## Development

```bash
# Start worker dev server
cd worker && npm run dev

# Watch extension changes
npm run ext:start
```

## Deployment

```bash
# Deploy worker
cd worker && npm run deploy

# Frontend auto-deploys via Pages
```

## Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1
- **Storage**: Cloudflare R2
- **AI**: Google Gemini
- **Frontend**: Vanilla JS (Cloudflare Pages)
