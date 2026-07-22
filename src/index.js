/**
 * Main Cloudflare Worker for Delhi Jal Board Twitter Advisory Telegram Bot
 * Entrypoint for Cron Triggers (scheduled) and HTTP Requests (fetch)
 */

import { fetchRecentTweets } from "./twitter.js";
import { analyzeTweetText, analyzeNoticeImage } from "./analyzer.js";
import { formatAdvisoryMessage } from "./formatter.js";
import { sendTelegramNotification } from "./telegram.js";

export default {
  /**
   * Cron Trigger Handler (runs at 12:00 PM IST & 6:00 PM IST)
   */
  async scheduled(event, env, ctx) {
    console.log(`Cron trigger executed at ${new Date().toISOString()} (Cron: ${event.cron})`);
    ctx.waitUntil(runAdvisoryCheckPipeline(env));
  },

  /**
   * HTTP Request Handler (for health check & manual trigger)
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Endpoint: /health
    if (url.pathname === "/health") {
      const stats = await getKVStats(env);
      return Response.json({
        status: "ok",
        service: "Delhi Jal Board Advisory Bot",
        time: new Date().toISOString(),
        stats: stats
      });
    }

    // Endpoint: /stats
    if (url.pathname === "/stats") {
      const stats = await getKVStats(env);
      return Response.json(stats);
    }

    // Endpoint: /trigger (Manual trigger for testing)
    if (url.pathname === "/trigger" && (request.method === "POST" || request.method === "GET")) {
      try {
        const result = await runAdvisoryCheckPipeline(env);
        return Response.json({
          status: "completed",
          timestamp: new Date().toISOString(),
          result: result
        });
      } catch (err) {
        console.error("Pipeline error:", err);
        return Response.json({
          status: "error",
          error: err.message || String(err),
          stack: err.stack
        }, { status: 500 });
      }
    }

    return new Response("Delhi Jal Board Twitter Advisory Bot is running.\nEndpoints: /health, /stats, POST /trigger", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};

/**
 * Main pipeline logic: fetch tweets -> analyze with AI -> send Telegram notifications -> update state
 */
async function runAdvisoryCheckPipeline(env) {
  console.log("Starting Advisory Check Pipeline...");

  const kv = env.TWEET_STORE;
  
  // 1. Get last processed tweet ID
  let lastTweetId = null;
  if (kv) {
    try {
      lastTweetId = await kv.get("last_tweet_id");
    } catch (e) {
      console.warn("KV fetch last_tweet_id warning:", e.message);
    }
  }
  console.log(`Last processed tweet ID from KV: ${lastTweetId || "None (First Run)"}`);

  // 2. Fetch recent tweets
  let tweets = [];
  try {
    tweets = await fetchRecentTweets(env, lastTweetId);
  } catch (err) {
    console.error("Failed to fetch tweets from SocialData:", err);
    throw new Error(`Twitter fetch failed: ${err.message}`);
  }

  if (!tweets || tweets.length === 0) {
    console.log("No new tweets found.");
    return { tweets_checked: 0, advisories_sent: 0, message: "No new tweets available" };
  }

  console.log(`Processing ${tweets.length} new tweets...`);

  let advisoriesSent = 0;
  let skippedTweets = 0;
  let newestProcessedId = lastTweetId;

  // 3. Process each tweet
  for (const tweet of tweets) {
    try {
      // Deduplication check
      if (kv) {
        const alreadyProcessed = await kv.get(`processed:${tweet.id_str}`);
        if (alreadyProcessed) {
          console.log(`Tweet ${tweet.id_str} already processed, skipping.`);
          continue;
        }
      }

      console.log(`Analyzing Tweet ID: ${tweet.id_str}`);

      // Stage 1: AI Text Analysis
      const textAnalysis = await analyzeTweetText(env, tweet.text);

      // Stage 2: AI Vision Analysis (if tweet has images)
      let imageAnalysis = null;
      const hasImages = tweet.images && tweet.images.length > 0;

      if (hasImages && (textAnalysis.is_advisory || textAnalysis.confidence < 0.6)) {
        imageAnalysis = await analyzeNoticeImage(env, tweet.images[0]);
      }

      // Determine final advisory verdict
      const isAdvisory = textAnalysis.is_advisory || Boolean(imageAnalysis && imageAnalysis.is_advisory);

      if (isAdvisory) {
        console.log(`🎯 Advisory detected for tweet ${tweet.id_str}! Sending to Telegram...`);

        // Format HTML message
        const htmlMsg = formatAdvisoryMessage(tweet, textAnalysis, imageAnalysis);

        // Send to Telegram
        const photoUrl = hasImages ? tweet.images[0] : null;
        await sendTelegramNotification(env, htmlMsg, photoUrl);

        advisoriesSent++;
      } else {
        console.log(`⏭️ Tweet ${tweet.id_str} is not a public advisory. Skipping.`);
        skippedTweets++;
      }

      // Mark processed in KV (TTL: 7 days)
      if (kv) {
        await kv.put(`processed:${tweet.id_str}`, JSON.stringify({
          processed_at: new Date().toISOString(),
          is_advisory: isAdvisory,
          category: textAnalysis.category
        }), { expirationTtl: 604800 });

        await kv.put("last_tweet_id", tweet.id_str);
      }

      newestProcessedId = tweet.id_str;

    } catch (tweetErr) {
      console.error(`Error processing tweet ${tweet.id_str}:`, tweetErr);
    }
  }

  // Update statistics
  await updateStats(env, tweets.length, advisoriesSent);

  return {
    tweets_checked: tweets.length,
    advisories_sent: advisoriesSent,
    skipped: skippedTweets,
    last_tweet_id: newestProcessedId
  };
}

/**
 * Update system statistics in KV
 */
async function updateStats(env, newCheckedCount, newAdvisoriesCount) {
  if (!env.TWEET_STORE) return;

  try {
    const rawStats = await env.TWEET_STORE.get("stats");
    let stats = rawStats ? JSON.parse(rawStats) : { total_checked: 0, advisories_sent: 0, runs: 0 };

    stats.total_checked = (stats.total_checked || 0) + newCheckedCount;
    stats.advisories_sent = (stats.advisories_sent || 0) + newAdvisoriesCount;
    stats.runs = (stats.runs || 0) + 1;
    stats.last_run = new Date().toISOString();

    await env.TWEET_STORE.put("stats", JSON.stringify(stats));
  } catch (err) {
    console.error("Failed to update stats in KV:", err);
  }
}

/**
 * Get KV statistics for /health and /stats endpoints
 */
async function getKVStats(env) {
  if (!env.TWEET_STORE) {
    return { status: "KV binding not configured" };
  }

  try {
    const lastId = await env.TWEET_STORE.get("last_tweet_id");
    const rawStats = await env.TWEET_STORE.get("stats");
    const stats = rawStats ? JSON.parse(rawStats) : {};

    return {
      last_processed_tweet_id: lastId || null,
      ...stats
    };
  } catch (err) {
    return { error: err.message };
  }
}
