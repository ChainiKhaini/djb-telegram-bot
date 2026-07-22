# 🚰 Delhi Jal Board Twitter → Telegram Advisory Bot

A serverless, automated alert system hosted on **Cloudflare Workers**. It monitors Delhi Jal Board's Twitter handle (`@DelhiJalBoard`), uses **Cloudflare Workers AI** (Meta Llama 3.1 Text + Llama 3.2 Vision) to analyze tweet text and notice posters, and broadcasts public advisories directly to a **Telegram Bot**.

---

## ⚡ Key Features

- **Automated Scheduling**: Runs twice daily via Cloudflare Cron Triggers at **12:00 PM IST (06:30 UTC)** and **6:00 PM IST (12:30 UTC)**.
- **Two-Stage AI Pipeline**:
  - **Stage 1 (Text)**: Meta Llama 3.1 8B Instruct classifies tweet text and filters out non-advisory posts.
  - **Stage 2 (Vision)**: Meta Llama 3.2 11B Vision performs OCR on official DJB notice images to extract affected localities, times, and emergency helpline numbers.
- **State & Deduplication**: Cloudflare KV tracks the last processed tweet ID and prevents duplicate notifications.
- **Cost Efficient**: Designed to operate **100% within the free tiers** of Cloudflare Workers, Cloudflare Workers AI, SocialData API, and Telegram.

---

## 🛠️ Project Structure

```
djb-telegram-bot/
├── src/
│   ├── index.js          # Main Worker — Cron handler + HTTP endpoints (/health, /trigger, /stats)
│   ├── twitter.js        # Twitter client using SocialData API
│   ├── analyzer.js       # Cloudflare Workers AI (Llama 3.1 Text & Llama 3.2 Vision)
│   ├── telegram.js       # Telegram Bot API client with retry & HTML support
│   └── formatter.js      # Message formatting for Telegram
├── wrangler.toml         # Cloudflare Worker configuration (Cron, KV, AI bindings)
├── package.json          # Project definition
├── .dev.vars.example     # Template for local development secrets
└── README.md             # Setup and deployment guide
```

---

## 🚀 Setup & Deployment Guide

### Prerequisites
1. **Node.js** (v18 or higher) installed on your machine.
2. **Cloudflare Account** (Free tier works great).
3. **Telegram Bot Token**:
   - Open Telegram and message [@BotFather](https://t.me/BotFather).
   - Send `/newbot`, name your bot, and copy the **API Token**.
4. **Telegram Chat ID**:
   - Send a message to your bot or add your bot to a group/channel.
   - Use [@userinfobot](https://t.me/userinfobot) or open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` to find your `chat.id`.
5. **SocialData API Key**:
   - Register at [socialdata.tools](https://socialdata.tools) and get an API key.

---

### Step 1: Clone & Install Dependencies

```bash
cd C:\Users\Geon\.gemini\antigravity\scratch\djb-telegram-bot
npm install
```

### Step 2: Create Cloudflare KV Namespace

Run Wrangler to create a KV namespace for storing state:

```bash
npx wrangler kv namespace create TWEET_STORE
```

Copy the output `id` (e.g. `a1b2c3d4...`) and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "TWEET_STORE"
id = "YOUR_ACTUAL_KV_NAMESPACE_ID"
```

### Step 3: Configure Cloudflare Secrets

Set your API keys and tokens securely in Cloudflare:

```bash
# 1. SocialData API Key
npx wrangler secret put SOCIALDATA_API_KEY

# 2. Telegram Bot Token
npx wrangler secret put TELEGRAM_BOT_TOKEN

# 3. Telegram Chat ID
npx wrangler secret put TELEGRAM_CHAT_ID
```

---

### Step 4: Local Testing

To test the worker locally:

1. Copy `.dev.vars.example` to `.dev.vars`:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
2. Open `.dev.vars` and insert your actual keys/tokens.
3. Start the dev server with scheduled testing enabled:
   ```bash
   npx wrangler dev --test-scheduled
   ```
4. In a separate terminal, trigger the scheduled event or HTTP endpoint:
   ```bash
   # Test via manual trigger endpoint
   curl -X POST http://localhost:8787/trigger

   # Test health endpoint
   curl http://localhost:8787/health
   ```

---

### Step 5: Deploy to Cloudflare Workers

Deploy the worker to production:

```bash
npx wrangler deploy
```

Once deployed, Wrangler will output your worker URL (e.g., `https://djb-telegram-bot.<your-subdomain>.workers.dev`).

---

## 🧪 Verification & HTTP Endpoints

You can interact with your deployed worker via HTTP:

- **`GET /health`**: Check system status, last checked time, and stats.
  ```bash
  curl https://djb-telegram-bot.<your-subdomain>.workers.dev/health
  ```
- **`GET /stats`**: View total tweets checked, advisories sent, and run counts.
- **`POST /trigger`**: Manually trigger a tweet check and AI analysis pipeline anytime without waiting for the cron schedule.
  ```bash
  curl -X POST https://djb-telegram-bot.<your-subdomain>.workers.dev/trigger
  ```

---

## 📊 Monthly Resource & Cost Breakdown

| Component | Free Allocation | Projected Usage | Cost |
|-----------|-----------------|-----------------|------|
| **Cloudflare Workers** | 100,000 req/day | ~2 crons + ~10 HTTP/day | **$0.00** |
| **Cloudflare Workers AI** | 10,000 neurons/day | ~350 neurons/day | **$0.00** |
| **Cloudflare KV** | 100,000 reads/day | ~6 reads/day | **$0.00** |
| **SocialData API** | 3 req/min free | ~60 requests/month | **$0.00** |
| **Telegram Bot API** | Unlimited | ~5–10 msgs/day | **$0.00** |
| **Total** | | | **$0.00 / month** |
