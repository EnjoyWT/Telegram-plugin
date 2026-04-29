# Telegram Transport Plugin

PiAgent IM v2 transport plugin for Telegram Bot API, implemented with `grammy`.

## Runtime

- Platform transport id: `telegram`
- Account mode: single account, `supportsMultipleAccounts: false`
- Inbound: grammY long polling
- Outbound: `bot.api.sendMessage`
- Thread support: `message_thread_id` is mapped to `event.thread.id` and passed back on delivery
- Target ids: Telegram chat ids only. Internal PiAgent route ids are never returned as send targets.

## Account Settings

Required:

- `botToken`: Telegram bot token from BotFather

Optional:

- `allowedChatIds`: comma-separated Telegram chat id allowlist
- `groupAtOnly`: require `@bot_username` in group messages, default `false`
- `dropPendingUpdates`: drop queued updates on connect, default `true`

## Development

```bash
pnpm install
pnpm run check
```

## Notes

The plugin uses the latest verified `grammy@1.42.0` runtime dependency. Phase 1 implements text messages only; files, images, callback buttons, and webhook mode are intentionally left for later.
