import { after } from "next/server";
import {
  ensureTelegramBotInitialized,
  getTelegramBot,
  isTelegramBotEnabled,
} from "@/lib/chat/telegram-bot";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTelegramBotEnabled()) {
    return Response.json(
      {
        error:
          "Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN in the project root .env.local.",
      },
      { status: 503 }
    );
  }

  await ensureTelegramBotInitialized();
  const telegramBot = getTelegramBot();
  if (!telegramBot) {
    return Response.json(
      {
        error:
          "Telegram bot could not be initialized. Confirm TELEGRAM_BOT_TOKEN is set in the project root .env.local.",
      },
      { status: 503 }
    );
  }

  return telegramBot.webhooks.telegram(request, {
    waitUntil: (task) => after(() => task),
  });
}
