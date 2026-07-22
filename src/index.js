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
   * HTTP Request Handler
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Public Endpoint: /health (Sanitized - no state or stack traces leaked)
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({
        status: "ok",
        service: "Delhi Jal Board Advisory Bot",
        time: new Date().toISOString()
      });
    }

    // Authenticated Endpoint: /stats
    if (url.pathname === "/stats" && request.method === "GET") {
      if (!isAuthorized(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const stats = await getKVStats(env);
      return Response.json(stats);
    }

    // Authenticated Endpoint: /trigger (POST only, required X-Trigger-Secret header)
    if (url.pathname === "/trigger") {
      if (request.method !== "POST") {
        return Response.json({ error: "Method not allowed. Use POST." }, { status: 405 });
      }

      if (!isAuthorized(request, env)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        const result = await runAdvisoryCheckPipeline(env);
        return Response.json({
          status: "completed",
          timestamp: new Date().toISOString(),
          result: result
        });
      } catch (err) {
        console.error("Pipeline error in /trigger:", err);
        // Generic error response to prevent stack trace leakage
        return Response.json({
          status: "error",
          message: "Internal server error during pipeline execution"
        }, { status: 500 });
      }
    }

    return new Response("Delhi Jal Board Advisory Bot Service.", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};

/**
 * Validates request authorization header against TRIGGER_SECRET
 */
function isAuthorized(request, env) {
  // If TRIGGER_SECRET is not configured in env, default to requiring header check if provided
  const triggerSecret = env.TRIGGER_SECRET;
  if (!triggerSecret) return true; // Open if secret not yet set, but recommend setting

  const authHeader = request.headers.get("X-Trigger-Secret") || request.headers.get("Authorization");
  return authHeader === triggerSecret || authHeader === `Bearer ${triggerSecret}`;
}

/**
 * Main pipeline logic: fetch tweets -> analyze with AI -> send Telegram notifications -> update state
 */
async function runAdvisoryCheckPipeline(env) {
  console.log("Starting Advisory Check Pipeline...");

  const kv = env.TWEET_STORE;

  // Concurrency Lock Guard (Distributed KV Lock with 60s TTL)
  if (kv) {
    const isLocked = await kv.get("lock:pipeline");
    if (isLocked) {
      console.warn("Pipeline run already in progress (KV lock active). Exiting.");
      return { status: "locked", message: "Concurrent run prevented by lock" };
    }
    // Set lock
    await kv.put("lock:pipeline", "true", { expirationTtl: 60 });
  }

  try {
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
      throw err;
    }

    if (!tweets || tweets.length === 0) {
      console.log("No new tweets found.");
      return { tweets_checked: 0, advisories_sent: 0, message: "No new tweets available" };
    }

    console.log(`Processing ${tweets.length} new tweets in ascending order...`);

    let advisoriesSent = 0;
    let skippedTweets = 0;
    let highWaterMarkId = lastTweetId;
    let hasFailure = false;

    // 3. Process each tweet (sorted chronologically ascending)
    for (const tweet of tweets) {
      if (hasFailure) {
        // If a preceding tweet failed, stop advancing highWaterMarkId to allow retry on next run
        console.warn(`Skipping remaining batch due to earlier tweet processing failure.`);
        break;
      }

      try {
        // Deduplication check
        if (kv) {
          const alreadyProcessed = await kv.get(`processed:${tweet.id_str}`);
          if (alreadyProcessed) {
            console.log(`Tweet ${tweet.id_str} already processed, skipping.`);
            highWaterMarkId = tweet.id_str;
            continue;
          }
        }

        console.log(`Analyzing Tweet ID: ${tweet.id_str}`);

        // Stage 1: AI Text Analysis
        const textAnalysis = await analyzeTweetText(env, tweet.text);

        // Stage 2: AI Vision Analysis
        // Fix flaw #3 & #15: Run Vision OCR if tweet has images AND (text is not advisory OR text confidence < 0.8 OR text lacks affected areas)
        let imageAnalysis = null;
        const hasImages = tweet.images && tweet.images.length > 0;
        const textHasAreas = textAnalysis.affected_areas && textAnalysis.affected_areas.length > 0;

        if (hasImages && (!textAnalysis.is_advisory || textAnalysis.confidence < 0.8 || !textHasAreas)) {
          console.log(`Triggering Vision OCR analysis for image: ${tweet.images[0]}`);
          imageAnalysis = await analyzeNoticeImage(env, tweet.images[0]);
        }

        // Determine final advisory verdict
        const isAdvisory = Boolean(textAnalysis.is_advisory || (imageAnalysis && imageAnalysis.is_advisory));

        if (isAdvisory) {
          console.log(`🎯 Advisory detected for tweet ${tweet.id_str}! Sending to Telegram...`);

          // Format full HTML message
          const fullHtmlMsg = formatAdvisoryMessage(tweet, textAnalysis, imageAnalysis);

          // Send to Telegram
          await sendTelegramNotification(env, tweet, textAnalysis, imageAnalysis, fullHtmlMsg);

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

          // Contiguous high water mark advancement
          highWaterMarkId = tweet.id_str;
          await kv.put("last_tweet_id", highWaterMarkId);
        }

      } catch (tweetErr) {
        console.error(`Error processing tweet ${tweet.id_str}:`, tweetErr);
        hasFailure = true;
      }
    }

    // Update statistics
    await updateStats(env, tweets.length, advisoriesSent);

    return {
      tweets_checked: tweets.length,
      advisories_sent: advisoriesSent,
      skipped: skippedTweets,
      last_tweet_id: highWaterMarkId
    };

  } finally {
    // Release concurrency lock
    if (kv) {
      await kv.delete("lock:pipeline");
    }
  }
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
 * Get KV statistics for authenticated /stats endpoint
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
