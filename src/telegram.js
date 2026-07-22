/**
 * Telegram Bot API Client
 */

export async function sendTelegramNotification(env, htmlMessage, photoUrl = null) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.");
  }

  // If photo is provided, try sending via sendPhoto first
  if (photoUrl) {
    try {
      const photoResult = await sendPhoto(token, chatId, photoUrl, htmlMessage);
      if (photoResult.ok) {
        return photoResult;
      }
      console.warn("sendPhoto failed, falling back to sendMessage:", photoResult);
    } catch (err) {
      console.warn("Error sending photo to Telegram, falling back to text:", err);
    }
  }

  // Fallback or default text message
  return await sendMessage(token, chatId, htmlMessage);
}

/**
 * Send HTML text message via sendMessage endpoint
 */
async function sendMessage(token, chatId, htmlText, maxRetries = 3) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text: htmlText,
    parse_mode: "HTML",
    disable_web_page_preview: false
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok && data.ok) {
      console.log(`Telegram message sent successfully (msg_id: ${data.result.message_id})`);
      return data;
    }

    // Rate limited
    if (response.status === 429) {
      const retryAfter = data.parameters?.retry_after || 5;
      console.warn(`Telegram rate limited. Waiting ${retryAfter}s before retry...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    throw new Error(`Telegram API Error (HTTP ${response.status}): ${data.description || JSON.stringify(data)}`);
  }

  throw new Error("Failed to send Telegram message after max retries.");
}

/**
 * Send photo with HTML caption via sendPhoto endpoint
 */
async function sendPhoto(token, chatId, photoUrl, captionHtml) {
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  // Caption limit in sendPhoto is 1024 characters
  const trimmedCaption = captionHtml.length > 1000 
    ? captionHtml.substring(0, 995) + "...</b>" 
    : captionHtml;

  const payload = {
    chat_id: chatId,
    photo: photoUrl,
    caption: trimmedCaption,
    parse_mode: "HTML"
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return await response.json();
}
