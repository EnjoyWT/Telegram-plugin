import { Bot } from 'grammy'
import { TransportConnectError } from './piagent-types.js'
import type {
  ImDeliveryCommand,
  ImDeliveryPayload,
  ImDeliveryResult,
  ImMention,
  ImPluginDiagnostics,
  ImSessionScope,
  ImTransportCapabilities,
  ImTransportInboundEvent,
  PluginLogger,
  PluginManifest,
  TransportPluginAccountRuntimeConfig,
  ImTransportPlugin,
  TransportTargetEntry,
  TransportTargetListQuery,
} from './piagent-types.js'

export const TELEGRAM_TRANSPORT_ID = 'telegram'
export const TELEGRAM_MAX_TEXT_LENGTH = 4096

type BotLike = {
  api: {
    getMe: () => Promise<TelegramUser>
    sendMessage: (chatId: string | number, text: string, options?: Record<string, unknown>) => Promise<unknown>
    sendChatAction?: (
      chatId: string | number,
      action: 'typing',
      options?: Record<string, unknown>
    ) => Promise<unknown>
  }
  on: (filter: string, handler: (ctx: TelegramContextLike) => unknown) => unknown
  start: (options?: Record<string, unknown>) => Promise<void>
  stop: () => void
}

type TelegramContextLike = {
  msg?: TelegramMessage
  message?: TelegramMessage
}

type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

type TelegramChat = {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel' | string
  title?: string
  first_name?: string
  last_name?: string
  username?: string
}

type TelegramMessageEntity = {
  type: string
  offset: number
  length: number
  user?: TelegramUser
}

export type TelegramMessage = {
  message_id: number
  message_thread_id?: number
  text?: string
  caption?: string
  chat: TelegramChat
  from?: TelegramUser
  date?: number
  entities?: TelegramMessageEntity[]
  caption_entities?: TelegramMessageEntity[]
  [key: string]: unknown
}

export type TelegramAccountConfig = {
  accountId: string
  botToken: string
  allowedChatIds: Set<string> | null
  dropPendingUpdates: boolean
  groupAtOnly: boolean
  includeBotMessages: boolean
  botUsername?: string | null
}

export type TelegramTransportOptions = {
  logger?: PluginLogger
  botFactory?: (token: string) => BotLike
  autoStartPolling?: boolean
  resolveAccountConfig?: (
    accountId: string
  ) => TelegramAccountConfig | TransportPluginAccountRuntimeConfig | null
}

type ConnectedTelegramAccount = {
  config: TelegramAccountConfig
  bot: BotLike
  botUser: TelegramUser
}

export const TELEGRAM_TRANSPORT_MANIFEST: PluginManifest = {
  id: TELEGRAM_TRANSPORT_ID,
  kind: 'transport',
  apiVersion: '1',
  version: '0.1.0',
  entry: './dist/index.mjs',
  displayName: 'Telegram',
  description: 'Telegram Bot API transport through grammY long polling.',
  permissions: {
    network: ['api.telegram.org'],
  },
  contributes: {
    transport: {},
    settings: {
      scope: 'transport_account',
      supportsMultipleAccounts: false,
      fields: [
        {
          key: 'botToken',
          type: 'secret',
          label: 'Bot Token',
          required: true,
          placeholder: '123456:ABC...',
        },
        {
          key: 'allowedChatIds',
          type: 'text',
          label: 'Allowed chat IDs',
          description: 'Comma-separated Telegram chat IDs. Leave empty to allow all.',
        },
        {
          key: 'groupAtOnly',
          type: 'boolean',
          label: 'Require @mention in groups',
          defaultValue: false,
        },
        {
          key: 'dropPendingUpdates',
          type: 'boolean',
          label: 'Drop pending updates on connect',
          defaultValue: true,
        },
      ],
    },
  },
}

const noopLogger: PluginLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

export function resolveTelegramAccountConfig(
  accountId: string,
  runtimeConfig: TransportPluginAccountRuntimeConfig | TelegramAccountConfig | null | undefined
): TelegramAccountConfig {
  if (isTelegramAccountConfig(runtimeConfig)) {
    return runtimeConfig
  }

  const config = runtimeConfig?.config ?? {}
  const secrets = runtimeConfig?.secrets ?? {}
  const botToken =
    readString(secrets.botToken) ??
    readString(config.botToken) ??
    readString(process.env.TELEGRAM_BOT_TOKEN)

  return {
    accountId,
    botToken: botToken ?? '',
    allowedChatIds: parseCsvSet(readString(config.allowedChatIds)),
    dropPendingUpdates: readBoolean(config.dropPendingUpdates) ?? true,
    groupAtOnly: readBoolean(config.groupAtOnly) ?? false,
    includeBotMessages: readBoolean(config.includeBotMessages) ?? false,
    botUsername: readString(config.botUsername),
  }
}

export function buildTelegramInboundEvent(input: {
  accountId: string
  botUsername?: string | null
  message: TelegramMessage
  allowedChatIds?: Set<string> | null
  groupAtOnly?: boolean
  includeBotMessages?: boolean
}): ImTransportInboundEvent | null {
  const message = input.message
  const chatId = String(message.chat.id)
  if (input.allowedChatIds && !input.allowedChatIds.has(chatId)) {
    return null
  }
  if (!input.includeBotMessages && message.from?.is_bot) {
    return null
  }

  const chatKind = telegramChatKind(message.chat.type)
  const text = message.text ?? message.caption ?? null
  if (!text) {
    return null
  }
  if (chatKind !== 'dm' && input.groupAtOnly && !mentionsBot(text, message, input.botUsername)) {
    return null
  }

  const messageId = String(message.message_id)
  const threadId = message.message_thread_id ? String(message.message_thread_id) : null
  const senderId = message.from ? String(message.from.id) : String(message.chat.id)

  return {
    id: `${TELEGRAM_TRANSPORT_ID}:${input.accountId}:${chatId}:${messageId}`,
    transportId: TELEGRAM_TRANSPORT_ID,
    accountId: input.accountId,
    receivedAt: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
    platform: {
      raw: message,
    },
    chat: {
      id: chatId,
      kind: chatKind,
      title: message.chat.title ?? telegramUserDisplayName(message.chat) ?? null,
    },
    sender: {
      id: senderId,
      displayName: message.from ? telegramUserDisplayName(message.from) : telegramUserDisplayName(message.chat),
      isBot: message.from?.is_bot ?? false,
    },
    thread: threadId
      ? {
          id: threadId,
          rootMessageId: null,
          replyToMessageId: null,
        }
      : null,
    message: {
      id: messageId,
      type: 'text',
      text,
      mentions: extractMentions(text, message),
      raw: message,
    },
    routingHint: {
      scope: threadId
        ? ('thread_per_member' satisfies ImSessionScope)
        : chatKind === 'dm'
          ? ('dm' satisfies ImSessionScope)
          : ('group_per_member' satisfies ImSessionScope),
    },
  }
}

export class TelegramTransportPlugin implements ImTransportPlugin {
  readonly metadata = {
    id: TELEGRAM_TRANSPORT_ID,
    displayName: 'Telegram',
    version: '0.1.0',
    protocolVersion: 2 as const,
    platformKind: 'telegram' as const,
  }

  private readonly logger: PluginLogger
  private readonly botFactory: (token: string) => BotLike
  private readonly autoStartPolling: boolean
  private readonly resolveConfig?: TelegramTransportOptions['resolveAccountConfig']
  private readonly accounts = new Map<string, ConnectedTelegramAccount>()
  private readonly inboundHandlers = new Set<(event: ImTransportInboundEvent) => Promise<void> | void>()

  constructor(options: TelegramTransportOptions = {}) {
    this.logger = options.logger ?? noopLogger
    this.botFactory = options.botFactory ?? ((token) => new Bot(token) as unknown as BotLike)
    this.autoStartPolling = options.autoStartPolling ?? true
    this.resolveConfig = options.resolveAccountConfig
  }

  getCapabilities(): ImTransportCapabilities {
    return {
      canEditMessage: false,
      canStreamByEdit: false,
      canRenderButtons: false,
      canRenderRichCards: false,
      canReplyInThread: true,
      canUploadImage: false,
      canUploadFile: false,
      canCollectStructuredForm: false,
      canQuoteReply: true,
      canMentionUsers: true,
      canReceiveCardCallbacks: false,
      maxTextLength: TELEGRAM_MAX_TEXT_LENGTH,
      supportedInboundMessageTypes: ['text'],
      supportedOutboundPayloadTypes: ['text', 'markdown', 'typing'],
    }
  }

  async getDiagnostics(accountId: string): Promise<ImPluginDiagnostics> {
    const observedAt = new Date().toISOString()
    try {
      const config = this.getConfig(accountId)
      const bot = this.accounts.get(accountId)?.bot ?? this.botFactory(config.botToken)
      const me = await bot.api.getMe()
      return {
        status: 'healthy',
        accountId,
        checks: [
          {
            id: 'account_config',
            status: 'pass',
            message: 'Telegram bot token is present.',
            observedAt,
          },
          {
            id: 'telegram_get_me',
            status: 'pass',
            message: `Telegram Bot API returned @${me.username ?? me.id}.`,
            observedAt,
          },
        ],
      }
    } catch (error) {
      return {
        status: 'unavailable',
        accountId,
        checks: [
          {
            id: 'telegram_get_me',
            status: 'fail',
            message: error instanceof Error ? error.message : 'Telegram diagnostics failed.',
            observedAt,
          },
        ],
      }
    }
  }

  async connect(accountId: string): Promise<void> {
    if (this.accounts.has(accountId)) {
      return
    }

    const config = this.getConfig(accountId)
    const bot = this.botFactory(config.botToken)

    try {
      const botUser = await bot.api.getMe()
      bot.on('message', (ctx) => {
        const message = ctx.msg ?? ctx.message
        if (!message) {
          return
        }
        const event = buildTelegramInboundEvent({
          accountId,
          botUsername: botUser.username ?? config.botUsername,
          message,
          allowedChatIds: config.allowedChatIds,
          groupAtOnly: config.groupAtOnly,
          includeBotMessages: config.includeBotMessages,
        })
        if (event) {
          void this.emitInbound(event)
        }
      })

      this.accounts.set(accountId, { config, bot, botUser })

      if (this.autoStartPolling) {
        void bot
          .start({ drop_pending_updates: config.dropPendingUpdates })
          .catch((error) => {
            if (isAbortLikeError(error)) {
              return
            }
            this.logger.error('Telegram polling failed', error)
          })
      }
      this.logger.info('Telegram transport connected', {
        accountId,
        username: botUser.username,
      })
    } catch (error) {
      throw new TransportConnectError('Unable to connect Telegram transport.', {
        code: 'TELEGRAM_CONNECT_FAILED',
        retryable: true,
        cause: error,
      })
    }
  }

  disconnect(accountId: string): void {
    const connected = this.accounts.get(accountId)
    if (!connected) {
      return
    }
    this.accounts.delete(accountId)
    connected.bot.stop()
  }

  async send(command: ImDeliveryCommand): Promise<ImDeliveryResult> {
    const connected = this.accounts.get(command.accountId)
    if (!connected) {
      return {
        status: 'failed',
        retryable: true,
        error: `Telegram account is not connected: ${command.accountId}`,
      }
    }

    const chatId = command.audience.externalChatId ?? command.audience.externalUserId
    if (!chatId) {
      return {
        status: 'failed',
        retryable: false,
        error: 'Telegram delivery requires audience.externalChatId or audience.externalUserId.',
      }
    }

    const threadId =
      command.audience.externalThreadId ??
      (command.audience as { threadId?: string | null }).threadId ??
      null
    const options: Record<string, unknown> = {}
    if (threadId) {
      const parsed = Number(threadId)
      options.message_thread_id = Number.isFinite(parsed) ? parsed : threadId
    }

    try {
      if (command.payload.kind === 'typing') {
        if (!connected.bot.api.sendChatAction) {
          return {
            status: 'failed',
            retryable: false,
            error: 'Telegram bot API does not support sendChatAction.',
          }
        }
        const result = await connected.bot.api.sendChatAction(chatId, 'typing', options)
        return {
          status: 'sent',
          externalMessageId: null,
          raw: result,
        }
      }

      const result = await connected.bot.api.sendMessage(chatId, deliveryPayloadToText(command.payload), options)
      return {
        status: 'sent',
        externalMessageId: extractTelegramMessageId(result),
        raw: result,
      }
    } catch (error) {
      return {
        status: 'failed',
        retryable: true,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  listTargets(input: TransportTargetListQuery): TransportTargetEntry[] {
    const targetId = readString(input.query)
    if (!targetId) {
      return []
    }
    return [
      {
        transportId: TELEGRAM_TRANSPORT_ID,
        transportAccountId: input.accountId,
        externalChatId: targetId,
        externalThreadId: null,
        externalUserId: null,
        channelKind: targetId.startsWith('-') ? 'group' : 'dm',
        title: targetId,
        description: 'Telegram platform chat id. Internal route ids are intentionally not exposed.',
        source: 'plugin',
        targetKind: targetId.startsWith('-') ? 'group' : 'dm',
      },
    ]
  }

  onInbound(handler: (event: ImTransportInboundEvent) => Promise<void> | void): () => void {
    this.inboundHandlers.add(handler)
    return () => {
      this.inboundHandlers.delete(handler)
    }
  }

  private getConfig(accountId: string): TelegramAccountConfig {
    const raw = this.resolveConfig?.(accountId) ?? null
    const config = resolveTelegramAccountConfig(accountId, raw)
    if (!config.botToken) {
      throw new TransportConnectError('Telegram botToken is required.', {
        code: 'TELEGRAM_BOT_TOKEN_REQUIRED',
        retryable: false,
      })
    }
    return config
  }

  private async emitInbound(event: ImTransportInboundEvent): Promise<void> {
    for (const handler of this.inboundHandlers) {
      await handler(event)
    }
  }
}

function isTelegramAccountConfig(value: unknown): value is TelegramAccountConfig {
  return Boolean(value && typeof value === 'object' && 'accountId' in value && 'botToken' in value)
}

function telegramChatKind(type: string): 'dm' | 'group' | 'channel' {
  if (type === 'private') {
    return 'dm'
  }
  if (type === 'channel') {
    return 'channel'
  }
  return 'group'
}

function telegramUserDisplayName(value: TelegramUser | TelegramChat | undefined): string | null {
  if (!value) {
    return null
  }
  const firstName = 'first_name' in value ? value.first_name : undefined
  const lastName = 'last_name' in value ? value.last_name : undefined
  return [firstName, lastName].filter(Boolean).join(' ') || value.username || null
}

function mentionsBot(text: string, message: TelegramMessage, botUsername?: string | null): boolean {
  if (botUsername && text.includes(`@${botUsername}`)) {
    return true
  }
  const entities = [...(message.entities ?? []), ...(message.caption_entities ?? [])]
  return entities.some((entity) => entity.type === 'text_mention' && entity.user?.is_bot)
}

function extractMentions(text: string, message: TelegramMessage): ImMention[] {
  const entities = [...(message.entities ?? []), ...(message.caption_entities ?? [])]
  return entities
    .filter((entity) => entity.type === 'mention' || entity.type === 'text_mention')
    .map((entity) => {
      const rawName = text.slice(entity.offset, entity.offset + entity.length)
      const user = entity.user
      return {
        id: user ? String(user.id) : rawName,
        name: user ? telegramUserDisplayName(user) : rawName,
        isBot: user?.is_bot ?? rawName.endsWith('bot'),
      }
    })
}

function deliveryPayloadToText(payload: ImDeliveryPayload): string {
  if (payload.kind === 'text') {
    return payload.text
  }
  if (payload.kind === 'markdown') {
    return payload.markdown || payload.fallbackText
  }
  if ('fallbackText' in payload && payload.fallbackText) {
    return payload.fallbackText
  }
  return payload.kind === 'typing' ? '' : JSON.stringify(payload)
}

function extractTelegramMessageId(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const id = (value as { message_id?: unknown }).message_id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const record = error as { name?: unknown; message?: unknown }
  return record.name === 'AbortError' || String(record.message ?? '').includes('Aborted')
}

function parseCsvSet(value: string | null): Set<string> | null {
  const parts = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return parts?.length ? new Set(parts) : null
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed || null
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true
    }
    if (value.toLowerCase() === 'false') {
      return false
    }
  }
  return null
}
