/**
 * AI Analysis module using Cloudflare Workers AI
 * - Stage 1: Text classification using Meta Llama 3.1 8B
 * - Stage 2: Vision analysis (OCR + extraction) using Meta Llama 3.2 11B Vision
 */

const TEXT_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3-8b-instruct"
];

const VISION_MODELS = [
  "@cf/meta/llama-3.2-11b-vision-instruct"
];

/**
 * Stage 1: Classify if tweet text is a DJB public advisory
 */
export async function analyzeTweetText(env, tweetText) {
  const systemPrompt = `You are an AI classifier for Delhi Jal Board (@DelhiJalBoard) tweets.
Your job is to determine if a tweet is a PUBLIC WATER ADVISORY that residents need to act on or be aware of.

ADVISORY tweets include:
- Water supply disruptions, shutdowns, or maintenance work affecting areas
- Low water pressure warnings in specific localities
- Water quality alerts or contamination notices
- Tanker supply schedules or emergency water helpline info
- Pipeline repair/burst notices
- Water supply restoration updates

NOT advisory (exclude these):
- Political statements or promotional updates
- General awareness campaigns ("save water" slogans)
- Event inaugurations or achievement posts
- Retweets without specific public advisory content

Analyze the tweet text and return ONLY a raw JSON object (no markdown, no backticks) with this structure:
{
  "is_advisory": true or false,
  "confidence": 0.0 to 1.0,
  "category": "Water Supply Disruption" | "Low Pressure Warning" | "Water Quality Alert" | "Tanker Supply" | "Maintenance & Repair" | "Restoration Notice" | "General Update",
  "summary_en": "A concise 1-2 sentence English summary of the notice",
  "affected_areas": ["List of area names if mentioned in text, else empty array"],
  "duration": "Disruption date/time info if mentioned, else null",
  "emergency_numbers": ["Emergency numbers if mentioned, else empty array"]
}`;

  for (const model of TEXT_MODELS) {
    try {
      console.log(`Running text analysis with model: ${model}`);
      const response = await env.AI.run(model, {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Tweet: "${tweetText}"` }
        ],
        max_tokens: 350
      });

      const outputText = typeof response === "object" ? (response.response || JSON.stringify(response)) : String(response);
      const parsed = cleanAndParseJson(outputText);

      if (parsed && typeof parsed.is_advisory === "boolean") {
        return parsed;
      }

      console.warn(`Model ${model} output was not valid JSON:`, outputText);
    } catch (error) {
      console.warn(`Error running AI text model ${model}:`, error.message || error);
    }
  }

  console.warn("All AI text models failed or returned non-JSON. Using keyword fallback analysis.");
  return fallbackTextAnalysis(tweetText);
}

/**
 * Stage 2: Vision OCR & Structured Data Extraction from Notice Image
 */
export async function analyzeNoticeImage(env, imageUrl) {
  console.log(`Fetching image for vision analysis: ${imageUrl}`);

  try {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      console.error(`Failed to fetch image: HTTP ${imgResponse.status}`);
      return null;
    }

    const imageBuffer = await imgResponse.arrayBuffer();
    const imageBytes = [...new Uint8Array(imageBuffer)];

    const prompt = `This is an official public notice poster from Delhi Jal Board.
Please extract all structured text and details from this image.

Return ONLY a raw JSON object (no markdown, no backticks) with this exact schema:
{
  "is_advisory": true or false,
  "title": "Title/Header of the notice",
  "affected_areas": ["List every single locality/area mentioned under Affected Areas"],
  "disruption_date": "Dates mentioned (e.g. 22/07/2026)",
  "disruption_time": "Time range mentioned (e.g. 10:00 AM for 8 hours)",
  "emergency_numbers": ["List all helpline/control room numbers listed"],
  "notice_summary": "1-2 sentence summary of what the notice states"
}`;

    for (const model of VISION_MODELS) {
      try {
        console.log(`Running vision analysis with model: ${model}`);
        const response = await env.AI.run(model, {
          prompt: prompt,
          image: imageBytes
        });

        const outputText = typeof response === "object" ? (response.response || JSON.stringify(response)) : String(response);
        const parsed = cleanAndParseJson(outputText);

        if (parsed) {
          return parsed;
        }
      } catch (err) {
        console.warn(`Vision model ${model} error:`, err.message || err);
      }
    }

    return null;

  } catch (error) {
    console.error("Error in AI Vision analysis pipeline:", error);
    return null;
  }
}

/**
 * Helper to extract clean JSON from AI output (stripping markdown backticks if any)
 */
function cleanAndParseJson(text) {
  if (typeof text !== "string") return null;

  try {
    let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleaned);
  } catch (err) {
    return null;
  }
}

/**
 * Heuristic keyword fallback if AI call fails
 */
function fallbackTextAnalysis(text) {
  const lower = text.toLowerCase();
  const advisoryKeywords = ["maintenance", "water supply", "affected", "disruption", "shutdown", "low pressure", "important_notice", "alert"];
  const matches = advisoryKeywords.filter(kw => lower.includes(kw));

  const isAdvisory = matches.length >= 2 || lower.includes("important_notice");

  return {
    is_advisory: isAdvisory,
    confidence: isAdvisory ? 0.7 : 0.2,
    category: isAdvisory ? "Water Supply Disruption" : "General Update",
    summary_en: text.substring(0, 150) + "...",
    affected_areas: [],
    duration: null,
    emergency_numbers: []
  };
}
