# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ListingGenius is a Chrome extension (Manifest V3) that provides AI-powered e-commerce listing optimization for Etsy and Amazon sellers. It integrates with OpenAI for content generation, Keywords Everywhere for keyword research, and fal.ai for AI image processing.

## Build Commands

```bash
# Generate extension icons (requires Node.js)
node scripts/generate-icons.js

# Load extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select this directory
```

No package manager or bundler is used. The extension uses vanilla JavaScript with ES6 modules.

## Architecture

### Extension Components

| Component | Entry Point | Purpose |
|-----------|-------------|---------|
| Popup | `popup/popup.html` | Main UI when extension icon clicked |
| Background | `background/service-worker.js` | Central message hub, API orchestration |
| Content Scripts | `content/etsy.js`, `content/amazon.js` | Injected into marketplace pages |
| Side Panel | `sidepanel/sidepanel.html` | Keyword research interface |
| Image Studio | `image-studio/image-studio.html` | AI image generation/editing |
| Options | `options/options.html` | Settings and API key configuration |

### Message Passing Architecture

All external API calls route through the service worker:
- Components send messages via `chrome.runtime.sendMessage()`
- Service worker (`background/service-worker.js`) handles all OpenAI, Keywords Everywhere, and fal.ai API calls
- Responses are returned to the originating component

### Content Script Structure

- `content/common.js` - Shared floating action button (FAB) and utilities, loaded first
- `content/etsy.js` / `content/amazon.js` - Platform-specific DOM selectors and form auto-fill logic

### Utility Modules

| File | Purpose |
|------|---------|
| `utils/api.js` | OpenAI and Keywords Everywhere API wrappers |
| `utils/fal-api.js` | fal.ai image processing (background removal, upscaling, generation) |
| `utils/storage.js` | Chrome storage management, credits, templates, image history |
| `utils/keywords.js` | Keyword extraction and analysis |

### External APIs

- **OpenAI** - Models: `gpt-4o-mini` (default), `gpt-4o` (for complex tasks), vision capabilities
- **Keywords Everywhere** - Search volume and keyword metrics
- **fal.ai** - Image models: Flux Pro, BiRefNet (background removal), Aura SR/ESRGAN (upscaling)

### Storage

Uses Chrome's `chrome.storage.local` for:
- API keys and settings
- Saved templates
- Usage history and credits
- Image generation history

## Key Patterns

- No build step required; load directly as unpacked extension
- Monthly credit system for image generation features
- Platform detection via URL matching in manifest.json

## Backend (Vercel)

The extension supports two modes:
1. **Direct Mode** - API keys stored locally (development/personal use)
2. **Backend Mode** - All API calls routed through secure Vercel backend (production)

### Backend Structure (`backend/`)

```
backend/
├── api/                 # Vercel serverless functions
│   ├── openai/         # OpenAI proxy (chat.js, vision.js)
│   ├── fal/            # fal.ai proxy (process.js)
│   ├── keywords/       # Keywords Everywhere proxy (search.js)
│   └── user/           # User management (index.js)
├── lib/                # Shared utilities
│   ├── auth.js        # JWT authentication
│   ├── ratelimit.js   # Rate limiting
│   ├── usage.js       # Usage tracking
│   └── response.js    # Response helpers
└── vercel.json        # Vercel configuration
```

### Backend Commands

```bash
cd backend
npm install
npm run dev        # Local development
npm run deploy     # Deploy to Vercel
```

### Switching Modes

To use backend mode, update `manifest.json`:
```json
"service_worker": "background/service-worker-backend.js"
```

And set the backend URL in `utils/backend-api.js`:
```javascript
const BACKEND_URL = 'https://your-project.vercel.app';
```

## Security

- Sender validation on all message handlers
- Rate limiting (30 requests/minute client-side, configurable server-side)
- URL validation for external image URLs (whitelist-based)
- CSP defined in manifest.json
- Auto-fill requires user confirmation dialog
