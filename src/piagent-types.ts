export type PluginKind = 'transport'

export type TransportPluginSettingsFieldType =
  | 'text'
  | 'secret'
  | 'select'
  | 'boolean'
  | 'number'

export type TransportPluginSettingsFieldOption = {
  value: string
  label: string
}

export type TransportPluginSettingsField = {
  key: string
  type: TransportPluginSettingsFieldType
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  defaultValue?: string | number | boolean | null
  options?: TransportPluginSettingsFieldOption[]
}

export type TransportPluginSettingsSchema = {
  scope: 'transport_account'
  supportsMultipleAccounts?: boolean
  fields: TransportPluginSettingsField[]
}

export type TransportPluginAccountConfigValue = string | number | boolean | null

export type TransportPluginAccountRuntimeConfig = {
  config: Record<string, TransportPluginAccountConfigValue>
  secrets: Record<string, string>
  enabled: boolean
}

export type PluginManifest = {
  id: string
  kind: PluginKind
  apiVersion: string
  version: string
  entry?: string
  displayName: string
  description?: string
  permissions?: {
    network?: string[]
    fs?: string[]
  }
  contributes?: {
    transport?: Record<string, never>
    settings?: TransportPluginSettingsSchema
  }
}

export type PluginLogger = {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown): void
}

export type PluginRegisterContext = {
  logger: PluginLogger
  pluginId?: string
  manifest?: PluginManifest
  sourceKind?: 'builtin' | 'user' | 'workspace'
  pluginRootDir?: string
  pluginConfigDir?: string
  appConfigDir?: string
}

export type BuiltinPluginModule<
  TPlugin,
  TContext extends PluginRegisterContext = PluginRegisterContext
> = {
  manifest: PluginManifest
  register(ctx: TContext): TPlugin | Promise<TPlugin>
}

export type ConversationChannelKind = 'dm' | 'group' | 'thread'

export type ImChatKind = 'dm' | 'group' | 'channel'

export type ImSessionScope =
  | 'dm'
  | 'group_shared'
  | 'group_per_member'
  | 'thread_shared'
  | 'thread_per_member'

export type ImMessageType =
  | 'text'
  | 'rich_text'
  | 'image'
  | 'file'
  | 'card_callback'
  | 'reaction'
  | 'system'

export type ImTransportPlatformKind =
  | 'feishu'
  | 'telegram'
  | 'slack'
  | 'wecom'
  | 'desktop'
  | 'generic'

export type AttachmentRef = {
  kind?: string
  url?: string
  fileName?: string
  mimeType?: string
}

export type ImMention = {
  id: string
  name?: string | null
  isBot?: boolean
}

export type ImAttachment = {
  id: string
  mimeType: string
  name?: string | null
  sizeBytes?: number | null
  url?: string | null
  raw?: unknown
}

export type ImTransportInboundEvent = {
  id: string
  transportId: string
  accountId: string
  receivedAt: string
  platform: {
    tenantId?: string | null
    appId?: string | null
    raw?: unknown
  }
  chat: {
    id: string
    kind: ImChatKind
    title?: string | null
    tenantId?: string | null
  }
  sender: {
    id: string
    displayName?: string | null
    tenantId?: string | null
    unionId?: string | null
    openId?: string | null
    userId?: string | null
    isBot?: boolean
  }
  thread?: {
    id: string
    rootMessageId?: string | null
    replyToMessageId?: string | null
  } | null
  message: {
    id: string
    type: ImMessageType
    text?: string | null
    mentions?: ImMention[]
    attachments?: ImAttachment[]
    raw?: unknown
  }
  routingHint?: {
    scope?: ImSessionScope
    forceNewConversation?: boolean
  }
}

export type InboundEnvelope = {
  envelopeId: string
  transportId: string
  transportAccountId: string
  externalMessageId: string
  externalChatId: string
  externalThreadId?: string | null
  externalUserId?: string | null
  externalUserDisplayName?: string
  channelKind: ConversationChannelKind
  receivedAt: string
  text?: string
  attachments?: AttachmentRef[]
  routingKey?: string
}

export type TransportTargetEntry = {
  transportId: string
  transportAccountId: string
  externalChatId: string
  externalThreadId?: string | null
  externalUserId?: string | null
  channelKind: ConversationChannelKind
  title: string
  description?: string
  source: 'plugin'
  targetKind?: 'contact' | 'dm' | 'group' | 'thread' | 'channel'
}

export type TransportTargetListQuery = {
  accountId: string
  query?: string | null
  limit?: number | null
  channelKind?: ConversationChannelKind | null
}

export type TransportCapabilityDegradeMode =
  | 'native'
  | 'text_fallback'
  | 'unsupported'

export type TransportCapabilities = {
  canEditMessage: boolean
  canStreamByEdit: boolean
  canRenderButtons: boolean
  canRenderRichCards: boolean
  canReplyInThread: boolean
  canUploadImage: boolean
  canUploadFile: boolean
  canCollectStructuredForm: boolean
  maxButtonsPerMessage?: number
  maxTextLength?: number
}

export type ImTransportCapabilities = TransportCapabilities & {
  canQuoteReply: boolean
  canMentionUsers: boolean
  canReceiveCardCallbacks: boolean
  supportedInboundMessageTypes: string[]
  supportedOutboundPayloadTypes: string[]
}

export type DeliveryMode = 'send' | 'edit' | 'append' | 'typing' | 'upload'

export type ImDeliveryPayload =
  | { kind: 'text'; text: string }
  | { kind: 'markdown'; markdown: string; fallbackText: string }
  | { kind: 'rich_card'; card: unknown; fallbackText: string }
  | { kind: 'interaction'; interactionId: string; prompt: string; options?: ImDeliveryOption[] }
  | { kind: 'file'; attachmentId: string; fallbackText?: string | null }
  | { kind: 'typing' }

export type ImDeliveryOption = {
  id: string
  label: string
  description?: string | null
}

export type ImDeliveryCommand = {
  deliveryId: string
  conversationId: string
  bindingId: string
  transportId: string
  accountId: string
  diagnosticTraceId?: string | null
  audience: {
    kind: 'chat' | 'thread' | 'user'
    chatKind?: ImChatKind | null
    externalChatId: string
    externalThreadId?: string | null
    externalUserId?: string | null
  }
  replyContext?: {
    replyToMessageId?: string | null
    rootMessageId?: string | null
    mentionUserIds?: string[]
  }
  payload: ImDeliveryPayload
  policy: {
    preferThread: boolean
    splitLongText: boolean
    allowCardFallback: boolean
    silent?: boolean
  }
}

export type DeliveryCommand = {
  deliveryId: string
  conversationId: string
  bindingId: string
  transportId: string
  transportAccountId: string
  externalChatId: string
  externalThreadId?: string | null
  externalUserId?: string | null
  channelKind?: ConversationChannelKind | null
  mode: DeliveryMode
  payload: unknown
}

export type DeliveryResult = {
  status: 'sent' | 'failed'
  externalMessageId?: string | null
  degradeMode?: TransportCapabilityDegradeMode
  error?: string | null
  raw?: unknown
}

export type ImDeliveryResult = {
  status: 'sent' | 'failed'
  externalMessageId?: string | null
  degradeMode?: string | null
  retryable?: boolean
  error?: string | null
  raw?: unknown
}

export type ImDiagnosticStatus = 'pass' | 'warn' | 'fail'

export type ImPluginDiagnostics = {
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown'
  accountId: string
  checks: Array<{
    id: string
    status: ImDiagnosticStatus
    message: string
    observedAt: string
    detail?: unknown
  }>
}

export type TransportMetadata = {
  id: string
  displayName: string
  version: string
}

export type ImTransportMetadata = TransportMetadata & {
  protocolVersion: 2
  platformKind: ImTransportPlatformKind
}

export type TransportInboundHandler = (
  envelope: InboundEnvelope
) => Promise<void> | void

export type TransportAccountRuntimeState =
  | 'connecting'
  | 'connected'
  | 'retrying'
  | 'fatal'
  | 'disconnected'

export type TransportAccountStatusChange = {
  accountId: string
  state: TransportAccountRuntimeState
  error?: string | null
  errorCode?: string | null
}

export type TransportConnectErrorOptions = {
  code?: string
  retryable?: boolean
  cause?: unknown
}

export class TransportConnectError extends Error {
  readonly code: string | null
  readonly retryable: boolean

  constructor(message: string, options: TransportConnectErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'TransportConnectError'
    this.code = options.code ? String(options.code) : null
    this.retryable = options.retryable ?? true
  }
}

export type TransportPlugin = {
  metadata: TransportMetadata
  getCapabilities(
    accountId: string
  ): Promise<TransportCapabilities> | TransportCapabilities
  listTargets?(
    input: TransportTargetListQuery
  ): Promise<TransportTargetEntry[]> | TransportTargetEntry[]
  validateAccount?(accountId: string): Promise<void> | void
  connect(accountId: string): Promise<void> | void
  disconnect(accountId: string): Promise<void> | void
  send(command: DeliveryCommand): Promise<DeliveryResult> | DeliveryResult
  onInbound(handler: TransportInboundHandler): () => void
  onAccountStatusChange?(
    handler: (status: TransportAccountStatusChange) => Promise<void> | void
  ): () => void
}

export type ImTransportPlugin = {
  metadata: ImTransportMetadata
  getCapabilities(
    accountId: string
  ): Promise<ImTransportCapabilities> | ImTransportCapabilities
  getDiagnostics(accountId: string): Promise<ImPluginDiagnostics> | ImPluginDiagnostics
  connect(accountId: string): Promise<void> | void
  disconnect(accountId: string): Promise<void> | void
  send(command: ImDeliveryCommand): Promise<ImDeliveryResult> | ImDeliveryResult
  onInbound(handler: (event: ImTransportInboundEvent) => Promise<void> | void): () => void
}

export type TransportRegisterContext = PluginRegisterContext & {
  getAccountConfig?: (
    accountId: string
  ) => TransportPluginAccountRuntimeConfig | null
}
