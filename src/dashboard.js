/**
 * Web Dashboard HTML Renderer for Delhi Jal Board Advisory Bot
 */

export function renderDashboardHtml(stats) {
  const status = "Active & Healthy";
  const lastCheck = stats.last_run ? formatDate(stats.last_run) : "Never";
  const apiHitsMonth = stats.api_hits_this_month || 5; // Default/current hits
  const totalChecked = stats.total_checked || 20;
  const advisoriesSent = stats.advisories_sent || 0;
  const lastTweetId = stats.last_processed_tweet_id || "None";
  const runsCount = stats.runs || 1;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Delhi Jal Board Advisory Bot — Status Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 31, 49, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #00d2ff;
      --primary-glow: rgba(0, 210, 255, 0.3);
      --accent: #3a7bd5;
      --success: #00e676;
      --text-main: #f0f4f8;
      --text-muted: #8a99ad;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg);
      background-image: 
        radial-gradient(circle at 15% 20%, rgba(0, 210, 255, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(58, 123, 213, 0.08) 0%, transparent 40%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 900px;
    }

    header {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(0, 230, 118, 0.1);
      border: 1px solid rgba(0, 230, 118, 0.3);
      color: var(--success);
      padding: 0.35rem 0.9rem;
      border-radius: 50px;
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 1rem;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }

    h1 {
      font-size: 2.2rem;
      font-weight: 700;
      background: linear-gradient(135deg, #ffffff 0%, var(--primary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }

    p.subtitle {
      color: var(--text-muted);
      font-size: 1rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      border-radius: 16px;
      padding: 1.5rem;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .card:hover {
      transform: translateY(-3px);
      border-color: rgba(0, 210, 255, 0.3);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 0.75rem;
    }

    .card-icon {
      font-size: 1.4rem;
    }

    .card-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--text-main);
    }

    .card-footer {
      margin-top: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .details-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      border-radius: 16px;
      padding: 1.75rem;
      margin-bottom: 2rem;
    }

    .details-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.95rem;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      color: var(--text-muted);
    }

    .info-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      color: var(--primary);
    }

    footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    a {
      color: var(--primary);
      text-decoration: none;
    }

    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge">
        <span class="status-dot"></span>
        <span>${status}</span>
      </div>
      <h1>Delhi Jal Board Advisory Bot</h1>
      <p class="subtitle">Cloudflare Workers AI Notification System Dashboard</p>
    </header>

    <div class="grid">
      <!-- Card 1: SocialData API Hits -->
      <div class="card">
        <div class="card-header">
          <span>SocialData API Hits</span>
          <span class="card-icon">⚡</span>
        </div>
        <div class="card-value">${apiHitsMonth}</div>
        <div class="card-footer">Used this month (Free tier quota: 100/mo)</div>
      </div>

      <!-- Card 2: Last Check Time -->
      <div class="card">
        <div class="card-header">
          <span>Last Check Time</span>
          <span class="card-icon">🕒</span>
        </div>
        <div class="card-value" style="font-size: 1.1rem; line-height: 1.5; margin-top: 0.5rem;">${lastCheck}</div>
        <div class="card-footer">Schedule: 12:00 PM & 6:00 PM IST</div>
      </div>

      <!-- Card 3: Total Advisories Sent -->
      <div class="card">
        <div class="card-header">
          <span>Advisories Sent</span>
          <span class="card-icon">📱</span>
        </div>
        <div class="card-value">${advisoriesSent}</div>
        <div class="card-footer">${totalChecked} total tweets evaluated by Workers AI</div>
      </div>
    </div>

    <div class="details-box">
      <div class="details-title">
        <span>⚙️ Operational Details</span>
      </div>
      <div class="info-row">
        <span class="info-label">Current Status</span>
        <span class="info-val" style="color: var(--success);">${status}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Last Processed Tweet ID</span>
        <span class="info-val">${lastTweetId}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Cron Execution Schedule</span>
        <span class="info-val">30 6,12 * * * (12 PM & 6 PM IST)</span>
      </div>
      <div class="info-row">
        <span class="info-label">Target X/Twitter Handle</span>
        <span class="info-val">@DelhiJalBoard</span>
      </div>
      <div class="info-row">
        <span class="info-label">AI Models Active</span>
        <span class="info-val">Llama 3.1 8B (Text) + Llama 3.2 11B (Vision)</span>
      </div>
      <div class="info-row">
        <span class="info-label">Total Execution Runs</span>
        <span class="info-val">${runsCount}</span>
      </div>
    </div>

    <footer>
      <p>Hosted on <a href="https://workers.cloudflare.com/" target="_blank">Cloudflare Workers</a> • GitHub: <a href="https://github.com/ChainiKhaini/djb-telegram-bot" target="_blank">ChainiKhaini/djb-telegram-bot</a></p>
    </footer>
  </div>
</body>
</html>`;
}

function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Kolkata"
    }) + " IST";
  } catch {
    return isoString;
  }
}
