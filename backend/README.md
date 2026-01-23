# ListingGenius Backend

Secure serverless backend for the ListingGenius Chrome Extension using **Firebase** and **Vercel**.

## Quick Start

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" (or select existing)
3. Name it (e.g., "listinggenius")
4. Disable Google Analytics (optional for this project)
5. Click "Create project"

### 2. Enable Firestore

1. In Firebase Console, go to **Build > Firestore Database**
2. Click "Create database"
3. Select **Production mode**
4. Choose a location (e.g., `us-central1`)
5. Click "Enable"

### 3. Get Service Account Credentials

1. Go to **Project Settings** (gear icon) > **Service accounts**
2. Click "Generate new private key"
3. Save the JSON file securely

### 4. Install Dependencies

```bash
cd backend
npm install
```

### 5. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Required
OPENAI_API_KEY=sk-your-openai-key
FAL_API_KEY=your-fal-key
JWT_SECRET=generate-random-32-char-string

# Firebase - paste entire JSON as single line
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
```

### 6. Run Locally

```bash
npm run dev
```

Backend runs at `http://localhost:3000`

### 7. Deploy to Vercel

```bash
# First time setup
npx vercel

# Production deployment
npm run deploy
```

### 8. Add Secrets to Vercel

```bash
vercel secrets add openai_api_key "sk-your-key"
vercel secrets add fal_api_key "your-fal-key"
vercel secrets add jwt_secret "your-random-secret"
vercel secrets add firebase_service_account '{"type":"service_account",...}'
```

Or use Vercel Dashboard:
1. Go to your project > Settings > Environment Variables
2. Add each variable for Production environment

---

## Firebase Collections

The backend automatically creates these Firestore collections:

| Collection | Purpose |
|------------|---------|
| `users` | User accounts (deviceId, plan, createdAt) |
| `usage` | Monthly usage tracking per user |
| `rateLimits` | Rate limiting data |
| `apiLogs` | Optional detailed API logs |

### Firestore Security Rules

Add these rules in Firebase Console > Firestore > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only allow server-side access (via Admin SDK)
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

This blocks all client-side access since we're using Admin SDK from the server.

### Recommended Indexes

Create these indexes in Firebase Console > Firestore > Indexes:

1. **usage** collection:
   - Fields: `month` (Ascending), `apiCalls` (Descending)

2. **users** collection:
   - Fields: `deviceId` (Ascending)

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/openai/chat` | POST | OpenAI chat completions |
| `/api/openai/vision` | POST | OpenAI image analysis |
| `/api/fal/process` | POST | fal.ai image processing |
| `/api/keywords/search` | POST | Keyword research |
| `/api/user?action=register` | POST | Register device |
| `/api/user?action=login` | POST | Login with device |
| `/api/user?action=info` | GET | Get user info |
| `/api/user?action=usage` | GET | Get usage stats |

---

## Architecture

```
backend/
├── api/                    # Vercel serverless functions
│   ├── cors.js            # CORS handler
│   ├── health.js          # Health check
│   ├── openai/
│   │   ├── chat.js        # Chat completions proxy
│   │   └── vision.js      # Vision API proxy
│   ├── fal/
│   │   └── process.js     # Image processing proxy
│   ├── keywords/
│   │   └── search.js      # Keyword research proxy
│   └── user/
│       └── index.js       # User management
├── lib/                    # Shared utilities
│   ├── firebase.js        # Firebase Admin initialization
│   ├── auth.js            # JWT + Firebase Auth
│   ├── ratelimit.js       # Rate limiting (Firestore)
│   ├── usage.js           # Usage tracking (Firestore)
│   └── response.js        # Response helpers
├── vercel.json            # Vercel configuration
├── package.json
└── .env.example           # Environment template
```

---

## Rate Limits

| Plan | Requests/min | Listings/month | Keywords | Images |
|------|--------------|----------------|----------|--------|
| Free | 20 | 10 | 20 | 5 |
| Pro | 100 | 100 | 500 | 50 |
| Business | 500 | Unlimited | Unlimited | 200 |

---

## Troubleshooting

### Firebase Connection Issues

```
Error: Could not load the default credentials
```

**Solution:** Ensure `FIREBASE_SERVICE_ACCOUNT` is set correctly:
- Must be valid JSON
- Must be a single line (no newlines except in private key)
- Private key newlines should be `\n` not actual newlines

### Rate Limiting Not Working

If rate limits reset immediately:
1. Check Firestore rules allow server writes
2. Verify `rateLimits` collection exists
3. Check Vercel logs for Firestore errors

### Usage Not Tracking

1. Verify Firestore connection in logs
2. Check `usage` collection in Firebase Console
3. Ensure user ID is being passed correctly

---

## Production Checklist

- [ ] Firebase project created
- [ ] Firestore enabled in production mode
- [ ] Service account key generated
- [ ] All environment variables set in Vercel
- [ ] Firestore security rules deployed
- [ ] Firestore indexes created
- [ ] JWT_SECRET is a strong random string
- [ ] EXTENSION_ID set to production extension ID
- [ ] Tested all endpoints
- [ ] Monitoring/alerts configured
