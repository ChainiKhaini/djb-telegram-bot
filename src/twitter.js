/**
 * Twitter API Client using SocialData API (https://socialdata.tools)
 */

export async function fetchRecentTweets(env, lastTweetId = null) {
  const apiKey = env.SOCIALDATA_API_KEY;
  const username = env.DJB_USERNAME || "DelhiJalBoard";

  if (!apiKey) {
    throw new Error("SOCIALDATA_API_KEY secret is not set.");
  }

  // Ensure lastTweetId is a valid non-empty numeric ID string
  const validLastId = (lastTweetId && lastTweetId !== "null" && lastTweetId !== "undefined" && String(lastTweetId).trim().length > 0)
    ? String(lastTweetId).trim()
    : null;

  let query = `from:${username}`;
  if (validLastId) {
    query += ` since_id:${validLastId}`;
  }

  const url = `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}`;
  console.log(`Fetching tweets from SocialData API: ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`SocialData API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawTweets = data.tweets || data.data || (Array.isArray(data) ? data : []);

  console.log(`Retrieved ${rawTweets.length} raw tweets from SocialData.`);

  // Normalize and parse tweet objects
  const normalizedTweets = rawTweets
    .map(tweet => parseTweet(tweet, username))
    .filter(tweet => !tweet.is_retweet);

  // Sort chronologically ascending (oldest first) so they are processed in sequence
  normalizedTweets.sort((a, b) => (BigInt(a.id_str) > BigInt(b.id_str) ? 1 : -1));

  return normalizedTweets;
}

/**
 * Normalizes a raw tweet object from SocialData into a standard format.
 */
function parseTweet(tweet, username) {
  const idStr = tweet.id_str || String(tweet.id);
  const text = tweet.full_text || tweet.text || "";
  const createdAt = tweet.tweet_created_at || tweet.created_at || new Date().toISOString();
  const isRetweet = text.startsWith("RT @") || Boolean(tweet.retweeted_status);

  // Extract image URLs from media entities
  const mediaEntities = tweet.extended_entities?.media || tweet.entities?.media || [];
  const images = mediaEntities
    .filter(m => m.type === "photo")
    .map(m => m.media_url_https || m.media_url)
    .filter(Boolean);

  const tweetUrl = `https://x.com/${username}/status/${idStr}`;

  return {
    id_str: idStr,
    text: text,
    created_at: createdAt,
    images: images,
    tweet_url: tweetUrl,
    is_retweet: isRetweet
  };
}
