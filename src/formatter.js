/**
 * Formatter for building rich HTML Telegram messages from AI analysis results
 */

export function formatAdvisoryMessage(tweet, textAnalysis, imageAnalysis = null) {
  const category = escapeHtml(textAnalysis.category || "Water Supply Disruption");
  const summary = escapeHtml(imageAnalysis?.notice_summary || textAnalysis.summary_en || "Public Advisory from Delhi Jal Board.");
  
  // Combine affected areas from text + image analysis
  const combinedAreasSet = new Set([
    ...(textAnalysis.affected_areas || []),
    ...(imageAnalysis?.affected_areas || [])
  ]);
  const affectedAreas = Array.from(combinedAreasSet).filter(Boolean);

  // Combine emergency numbers
  const combinedNumbersSet = new Set([
    ...(textAnalysis.emergency_numbers || []),
    ...(imageAnalysis?.emergency_numbers || [])
  ]);
  const emergencyNumbers = Array.from(combinedNumbersSet).filter(Boolean);

  // Format date
  const tweetDate = formatDate(tweet.created_at);

  let message = `🚰 <b>DELHI JAL BOARD ADVISORY</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `📋 <b>Category:</b> ${category}\n`;
  message += `📅 <b>Date:</b> ${tweetDate}\n\n`;

  message += `📝 <b>Summary:</b>\n${summary}\n\n`;

  if (affectedAreas.length > 0) {
    const formattedAreas = affectedAreas.map(a => escapeHtml(a)).join(", ");
    message += `📍 <b>Affected Areas:</b>\n${formattedAreas}\n\n`;
  }

  const duration = imageAnalysis?.disruption_time || textAnalysis.duration;
  if (duration) {
    message += `⏰ <b>Duration:</b> ${escapeHtml(duration)}\n\n`;
  }

  if (emergencyNumbers.length > 0) {
    message += `📞 <b>Emergency Numbers:</b> ${escapeHtml(emergencyNumbers.join(", "))}\n\n`;
  } else {
    message += `📞 <b>Water Emergency Helpline:</b> 1916\n\n`;
  }

  // Include sanitized original tweet snippet
  const tweetSnippet = escapeHtml(tweet.text.length > 300 ? tweet.text.substring(0, 297) + "..." : tweet.text);
  message += `💬 <b>Original Post:</b>\n<blockquote>${tweetSnippet}</blockquote>\n\n`;

  message += `🔗 <a href="${tweet.tweet_url}">View Post on X/Twitter</a>`;

  return message;
}

/**
 * Escapes HTML characters for Telegram HTML parse_mode
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format ISO timestamp into user friendly date format
 */
function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata"
    }) + " IST";
  } catch (e) {
    return isoString || "Today";
  }
}
