import { Bot } from 'grammy'
import { TransportConnectError } from './piagent-types.js'
import type {
  ImDeliveryCommand,
  ImDeliveryPayload,
  ImDeliveryResult,
  ImAttachment,
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
    setMyCommands?: (commands: TelegramBotCommand[]) => Promise<unknown>
    sendMessage: (chatId: string | number, text: string, options?: Record<string, unknown>) => Promise<unknown>
    sendPhoto?: (
      chatId: string | number,
      photo: string,
      options?: Record<string, unknown>
    ) => Promise<unknown>
    sendDocument?: (
      chatId: string | number,
      document: string,
      options?: Record<string, unknown>
    ) => Promise<unknown>
    sendVideo?: (
      chatId: string | number,
      video: string,
      options?: Record<string, unknown>
    ) => Promise<unknown>
    sendAudio?: (
      chatId: string | number,
      audio: string,
      options?: Record<string, unknown>
    ) => Promise<unknown>
    sendVoice?: (
      chatId: string | number,
      voice: string,
      options?: Record<string, unknown>
    ) => Promise<unknown>
    answerCallbackQuery?: (callbackQueryId: string, options?: Record<string, unknown>) => Promise<unknown>
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
  callbackQuery?: TelegramCallbackQuery
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

type TelegramBotCommand = {
  command: string
  description: string
}

type TelegramFileRef = {
  file_id: string
  file_unique_id?: string
  file_size?: number
  file_name?: string
  mime_type?: string
  width?: number
  height?: number
}

type TelegramCallbackQuery = {
  id: string
  data?: string
  from: TelegramUser
  message?: TelegramMessage
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
  reply_to_message?: Pick<TelegramMessage, 'message_id' | 'text' | 'caption'> | null
  photo?: TelegramFileRef[]
  document?: TelegramFileRef
  audio?: TelegramFileRef
  voice?: TelegramFileRef
  video?: TelegramFileRef
  sticker?: TelegramFileRef & { emoji?: string; set_name?: string }
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

export const DEFAULT_TELEGRAM_BOT_COMMANDS: TelegramBotCommand[] = [
  { command: 'help', description: 'Show available IM commands' },
  { command: 'status', description: 'Show current session status' },
  { command: 'diagnostics', description: 'Show IM diagnostics for this message' },
  { command: 'queue', description: 'Show queued runs for this chat' },
  { command: 'session', description: 'Show session routing details' },
  { command: 'model', description: 'Show or switch the current session model' },
  { command: 'stop', description: 'Stop the active run in this chat' },
  { command: 'reset', description: 'Reset the current IM session' },
]

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
  const attachments = extractTelegramAttachments(message)
  const rawText = message.text ?? message.caption ?? null
  const text = normalizeInboundText(rawText, input.botUsername)
  if (!text && attachments.length === 0) {
    return null
  }
  if (
    chatKind !== 'dm' &&
    input.groupAtOnly &&
    !mentionsBot(rawText ?? '', message, input.botUsername)
  ) {
    return null
  }

  const messageId = String(message.message_id)
  const threadId = message.message_thread_id ? String(message.message_thread_id) : null
  const replyToMessageId =
    typeof message.reply_to_message?.message_id === 'number'
      ? String(message.reply_to_message.message_id)
      : null
  const senderId = message.from ? String(message.from.id) : String(message.chat.id)
  const messageType = resolveTelegramMessageType(message, attachments)

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
          replyToMessageId,
        }
      : null,
    message: {
      id: messageId,
      type: messageType,
      text,
      mentions: extractMentions(text ?? '', message),
      attachments,
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

function buildTelegramCallbackInboundEvent(input: {
  accountId: string
  callbackQuery: TelegramCallbackQuery
  allowedChatIds?: Set<string> | null
  includeBotMessages?: boolean
}): ImTransportInboundEvent | null {
  const callbackQuery = input.callbackQuery
  const message = callbackQuery.message
  const data = readString(callbackQuery.data)
  if (!message || !data) {
    return null
  }

  const chatId = String(message.chat.id)
  if (input.allowedChatIds && !input.allowedChatIds.has(chatId)) {
    return null
  }
  if (!input.includeBotMessages && callbackQuery.from.is_bot) {
    return null
  }

  const chatKind = telegramChatKind(message.chat.type)
  const messageId = readString(callbackQuery.id) ?? String(message.message_id)
  const threadId = message.message_thread_id ? String(message.message_thread_id) : null
  const senderId = String(callbackQuery.from.id)

  return {
    id: `${TELEGRAM_TRANSPORT_ID}:${input.accountId}:${chatId}:callback:${messageId}`,
    transportId: TELEGRAM_TRANSPORT_ID,
    accountId: input.accountId,
    receivedAt: new Date().toISOString(),
    platform: {
      raw: callbackQuery,
    },
    chat: {
      id: chatId,
      kind: chatKind,
      title: message.chat.title ?? telegramUserDisplayName(message.chat) ?? null,
    },
    sender: {
      id: senderId,
      displayName: telegramUserDisplayName(callbackQuery.from),
      isBot: callbackQuery.from.is_bot ?? false,
    },
    thread: threadId
      ? {
          id: threadId,
          rootMessageId: null,
          replyToMessageId: String(message.message_id),
        }
      : null,
    message: {
      id: messageId,
      type: 'card_callback',
      text: data,
      mentions: [],
      attachments: [],
      raw: callbackQuery,
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
      canRenderButtons: true,
      canRenderRichCards: false,
      canReplyInThread: true,
      canUploadImage: true,
      canUploadFile: true,
      canCollectStructuredForm: false,
      canQuoteReply: true,
      canMentionUsers: true,
      canReceiveCardCallbacks: true,
      maxTextLength: TELEGRAM_MAX_TEXT_LENGTH,
      maxButtonsPerMessage: 8,
      supportedInboundMessageTypes: ['text', 'image', 'file', 'audio', 'video', 'card_callback'],
      supportedOutboundPayloadTypes: ['text', 'markdown', 'typing', 'file', 'interaction'],
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
      bot.on('callback_query:data', (ctx) => {
        const callbackQuery = ctx.callbackQuery
        if (!callbackQuery) {
          return
        }
        const event = buildTelegramCallbackInboundEvent({
          accountId,
          callbackQuery,
          allowedChatIds: config.allowedChatIds,
          includeBotMessages: config.includeBotMessages,
        })
        if (event) {
          void this.emitInbound(event)
        }
        void bot.api.answerCallbackQuery?.(callbackQuery.id).catch((error) => {
          this.logger.warn('Unable to answer Telegram callback query', error)
        })
      })

      this.accounts.set(accountId, { config, bot, botUser })
      await registerTelegramBotCommands(bot, this.logger)

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
    applyTelegramReplyOptions(options, command.replyContext)

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

      const media = extractOutboundMedia(command.payload)
      if (media) {
        const result = await sendTelegramMedia(connected.bot, chatId, media, options)
        return {
          status: 'sent',
          externalMessageId: extractTelegramMessageId(result),
          raw: result,
        }
      }

      applyTelegramInteractionOptions(options, command.payload)
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
  const expected = botUsername ? `@${botUsername.toLowerCase().replace(/^@/, '')}` : null
  const entities = [...(message.entities ?? []), ...(message.caption_entities ?? [])]
  return entities.some((entity) => {
    if (entity.type === 'text_mention') {
      return Boolean(entity.user?.is_bot)
    }
    const raw = text.slice(entity.offset, entity.offset + entity.length).toLowerCase()
    if (entity.type === 'mention') {
      return Boolean(expected && raw === expected)
    }
    if (entity.type === 'bot_command') {
      const suffix = raw.split('@', 2)[1]
      return Boolean(expected && suffix && `@${suffix}` === expected)
    }
    return false
  })
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
  if (payload.kind === 'interaction') {
    return payload.prompt
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

function normalizeInboundText(text: string | null, botUsername?: string | null): string | null {
  const trimmed = readString(text)
  if (!trimmed) {
    return null
  }
  const username = readString(botUsername)?.replace(/^@/, '')
  if (!username || !trimmed.startsWith('/')) {
    return trimmed
  }
  const [commandToken = '', ...rest] = trimmed.split(/\s+/)
  const suffix = `@${username.toLowerCase()}`
  if (!commandToken.toLowerCase().endsWith(suffix)) {
    return trimmed
  }
  const withoutSuffix = commandToken.slice(0, commandToken.length - suffix.length)
  return [withoutSuffix, ...rest].join(' ').trim() || trimmed
}

function resolveTelegramMessageType(
  message: TelegramMessage,
  attachments: ImAttachment[]
): ImTransportInboundEvent['message']['type'] {
  if (message.photo?.length) {
    return 'image'
  }
  if (message.video) {
    return 'file'
  }
  if (message.audio || message.voice) {
    return 'file'
  }
  if (message.document || message.sticker || attachments.length > 0) {
    return 'file'
  }
  return 'text'
}

function extractTelegramAttachments(message: TelegramMessage): ImAttachment[] {
  const attachments: ImAttachment[] = []
  const largestPhoto = message.photo?.length
    ? [...message.photo].sort((left, right) => scorePhoto(right) - scorePhoto(left))[0]
    : null
  if (largestPhoto) {
    attachments.push(toAttachment(largestPhoto, {
      mimeType: 'image/jpeg',
      name: 'telegram-photo.jpg',
      rawKind: 'photo',
    }))
  }
  if (message.document) {
    attachments.push(toAttachment(message.document, {
      mimeType: message.document.mime_type || 'application/octet-stream',
      name: message.document.file_name || 'telegram-document',
      rawKind: 'document',
    }))
  }
  if (message.video) {
    attachments.push(toAttachment(message.video, {
      mimeType: message.video.mime_type || 'video/mp4',
      name: message.video.file_name || 'telegram-video.mp4',
      rawKind: 'video',
    }))
  }
  if (message.audio) {
    attachments.push(toAttachment(message.audio, {
      mimeType: message.audio.mime_type || 'audio/mpeg',
      name: message.audio.file_name || 'telegram-audio',
      rawKind: 'audio',
    }))
  }
  if (message.voice) {
    attachments.push(toAttachment(message.voice, {
      mimeType: message.voice.mime_type || 'audio/ogg',
      name: 'telegram-voice.ogg',
      rawKind: 'voice',
    }))
  }
  if (message.sticker) {
    attachments.push(toAttachment(message.sticker, {
      mimeType: message.sticker.mime_type || 'image/webp',
      name: 'telegram-sticker.webp',
      rawKind: 'sticker',
    }))
  }
  return attachments
}

function scorePhoto(photo: TelegramFileRef): number {
  return photo.file_size ?? (photo.width ?? 0) * (photo.height ?? 0)
}

function toAttachment(
  file: TelegramFileRef,
  input: { mimeType: string; name: string; rawKind: string }
): ImAttachment {
  return {
    id: file.file_id,
    mimeType: input.mimeType,
    name: input.name,
    sizeBytes: file.file_size ?? null,
    raw: {
      kind: input.rawKind,
      fileId: file.file_id,
      fileUniqueId: file.file_unique_id ?? null,
      width: file.width ?? null,
      height: file.height ?? null,
    },
  }
}

async function registerTelegramBotCommands(
  bot: BotLike,
  logger: PluginLogger
): Promise<void> {
  if (!bot.api.setMyCommands) {
    return
  }
  try {
    await bot.api.setMyCommands(DEFAULT_TELEGRAM_BOT_COMMANDS)
  } catch (error) {
    logger.warn('Unable to register Telegram bot commands', error)
  }
}

function applyTelegramReplyOptions(
  options: Record<string, unknown>,
  replyContext: ImDeliveryCommand['replyContext'] | undefined
): void {
  const replyToMessageId = readString(replyContext?.replyToMessageId)
  if (!replyToMessageId) {
    return
  }
  const parsed = Number(replyToMessageId)
  if (!Number.isFinite(parsed)) {
    return
  }
  options.reply_parameters = {
    message_id: parsed,
    allow_sending_without_reply: true,
  }
}

function applyTelegramInteractionOptions(
  options: Record<string, unknown>,
  payload: ImDeliveryPayload
): void {
  if (payload.kind !== 'interaction' || !payload.options?.length) {
    return
  }
  const buttons = payload.options.slice(0, 8).map((option) => ({
    text: option.label || option.id,
    callback_data: toTelegramCallbackData(option.id),
  }))
  if (buttons.length === 0) {
    return
  }
  options.reply_markup = {
    inline_keyboard: chunk(buttons, 2),
  }
}

function toTelegramCallbackData(value: string): string {
  const normalized = readString(value) ?? 'option'
  return Buffer.byteLength(normalized, 'utf8') <= 64
    ? normalized
    : Buffer.from(normalized, 'utf8').subarray(0, 64).toString('utf8')
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
}

type OutboundMediaPayload = {
  kind: 'photo' | 'document' | 'video' | 'audio' | 'voice'
  source: string
  caption?: string | null
  fileName?: string | null
}

function extractOutboundMedia(payload: ImDeliveryPayload): OutboundMediaPayload | null {
  if (payload.kind !== 'file') {
    return null
  }
  const record = payload as ImDeliveryPayload & {
    url?: string | null
    filePath?: string | null
    path?: string | null
    mimeType?: string | null
    name?: string | null
    caption?: string | null
    fallbackText?: string | null
  }
  const source = readString(record.url) ?? readString(record.filePath) ?? readString(record.path)
  if (!source) {
    return null
  }
  const mimeType = readString(record.mimeType) ?? ''
  const name = readString(record.name)
  const caption = readString(record.caption) ?? readString(record.fallbackText)
  if (mimeType.startsWith('image/')) {
    return { kind: 'photo', source, caption, fileName: name }
  }
  if (mimeType.startsWith('video/')) {
    return { kind: 'video', source, caption, fileName: name }
  }
  if (mimeType === 'audio/ogg' || mimeType === 'audio/opus') {
    return { kind: 'voice', source, caption, fileName: name }
  }
  if (mimeType.startsWith('audio/')) {
    return { kind: 'audio', source, caption, fileName: name }
  }
  return { kind: 'document', source, caption, fileName: name }
}

async function sendTelegramMedia(
  bot: BotLike,
  chatId: string,
  media: OutboundMediaPayload,
  options: Record<string, unknown>
): Promise<unknown> {
  const mediaOptions = {
    ...options,
    ...(media.caption ? { caption: media.caption } : {}),
    ...(media.fileName ? { filename: media.fileName } : {}),
  }
  if (media.kind === 'photo' && bot.api.sendPhoto) {
    return bot.api.sendPhoto(chatId, media.source, mediaOptions)
  }
  if (media.kind === 'video' && bot.api.sendVideo) {
    return bot.api.sendVideo(chatId, media.source, mediaOptions)
  }
  if (media.kind === 'audio' && bot.api.sendAudio) {
    return bot.api.sendAudio(chatId, media.source, mediaOptions)
  }
  if (media.kind === 'voice' && bot.api.sendVoice) {
    return bot.api.sendVoice(chatId, media.source, mediaOptions)
  }
  if (bot.api.sendDocument) {
    return bot.api.sendDocument(chatId, media.source, mediaOptions)
  }
  return bot.api.sendMessage(chatId, media.caption || media.source, options)
}
