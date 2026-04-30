import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TELEGRAM_TRANSPORT_MANIFEST,
  TelegramTransportPlugin,
  buildTelegramInboundEvent,
  resolveTelegramAccountConfig,
} from '../src/telegram-transport.js'

const runtimeConfig = {
  enabled: true,
  config: {},
  secrets: {
    botToken: '123:token',
  },
}

describe('Telegram transport contract', () => {
  it('advertises one account in phase 1', () => {
    assert.equal(TELEGRAM_TRANSPORT_MANIFEST.id, 'telegram')
    assert.equal(TELEGRAM_TRANSPORT_MANIFEST.contributes?.settings?.supportsMultipleAccounts, false)
  })

  it('resolves account config from PiAgent account secrets', () => {
    const account = resolveTelegramAccountConfig('default', runtimeConfig)

    assert.equal(account.accountId, 'default')
    assert.equal(account.botToken, '123:token')
    assert.equal(account.dropPendingUpdates, true)
  })

  it('maps Telegram messages into PiAgent inbound events', () => {
    const event = buildTelegramInboundEvent({
      accountId: 'default',
      botUsername: 'yolo_bot',
      message: {
        message_id: 7,
        message_thread_id: 123,
        text: 'hello',
        chat: { id: -100123, type: 'supergroup', title: 'Engineering' },
        from: { id: 42, first_name: 'Ada', username: 'ada' },
      },
    })

    assert.ok(event)
    assert.equal(event.transportId, 'telegram')
    assert.equal(event.accountId, 'default')
    assert.equal(event.chat.id, '-100123')
    assert.equal(event.chat.kind, 'group')
    assert.equal(event.chat.title, 'Engineering')
    assert.equal(event.sender.id, '42')
    assert.equal(event.sender.displayName, 'Ada')
    assert.equal(event.message.id, '7')
    assert.equal(event.thread?.id, '123')
    assert.equal(event.message.text, 'hello')
  })

  it('strips Telegram bot suffixes from group command menu messages', () => {
    const event = buildTelegramInboundEvent({
      accountId: 'default',
      botUsername: 'yolo_bot',
      groupAtOnly: true,
      message: {
        message_id: 8,
        text: '/status@yolo_bot',
        chat: { id: -100123, type: 'supergroup', title: 'Engineering' },
        from: { id: 42, first_name: 'Ada' },
        entities: [{ type: 'bot_command', offset: 0, length: 16 }],
      },
    })

    assert.ok(event)
    assert.equal(event.message.text, '/status')
  })

  it('maps replies to Telegram messages into reply context', () => {
    const event = buildTelegramInboundEvent({
      accountId: 'default',
      botUsername: 'yolo_bot',
      message: {
        message_id: 9,
        message_thread_id: 123,
        text: 'follow up',
        chat: { id: -100123, type: 'supergroup' },
        from: { id: 42, first_name: 'Ada' },
        reply_to_message: { message_id: 7 },
      },
    })

    assert.ok(event)
    assert.equal(event.thread?.id, '123')
    assert.equal(event.thread?.replyToMessageId, '7')
  })

  it('maps Telegram photos into image attachments without requiring text', () => {
    const event = buildTelegramInboundEvent({
      accountId: 'default',
      botUsername: 'yolo_bot',
      message: {
        message_id: 10,
        chat: { id: 123456, type: 'private' },
        from: { id: 42, first_name: 'Ada' },
        photo: [
          { file_id: 'small-file', file_unique_id: 'small', file_size: 100, width: 64, height: 64 },
          { file_id: 'large-file', file_unique_id: 'large', file_size: 2000, width: 1024, height: 768 },
        ],
      },
    })

    assert.ok(event)
    assert.equal(event.message.type, 'image')
    assert.equal(event.message.attachments?.[0]?.id, 'large-file')
    assert.equal(event.message.attachments?.[0]?.mimeType, 'image/jpeg')
  })

  it('registers Telegram bot commands on connect', async () => {
    const commands: unknown[] = []
    const fakeBot = {
      api: {
        getMe: async () => ({ id: 1, is_bot: true, username: 'yolo_bot' }),
        setMyCommands: async (items: unknown[]) => {
          commands.push(...items)
          return true
        },
        sendMessage: async () => ({ message_id: 9 }),
      },
      on: () => undefined,
      start: async () => undefined,
      stop: () => undefined,
    }

    const plugin = new TelegramTransportPlugin({
      resolveAccountConfig: () => runtimeConfig,
      botFactory: () => fakeBot,
      autoStartPolling: false,
    })

    await plugin.connect('default')

    assert.ok(commands.some((command: any) => command.command === 'status'))
    assert.ok(commands.some((command: any) => command.command === 'model'))
    assert.ok(commands.some((command: any) => command.command === 'models'))
    assert.ok(commands.some((command: any) => command.command === 'stop'))
    assert.equal(commands.some((command: any) => command.command === 'newsession'), false)
  })

  it('maps Telegram callback queries into card callback inbound events', async () => {
    let callbackHandler: ((ctx: any) => unknown) | null = null
    const fakeBot = {
      api: {
        getMe: async () => ({ id: 1, is_bot: true, username: 'yolo_bot' }),
        setMyCommands: async () => true,
        sendMessage: async () => ({ message_id: 9 }),
        answerCallbackQuery: async () => true,
      },
      on: (filter: string, handler: (ctx: any) => unknown) => {
        if (filter === 'callback_query:data') {
          callbackHandler = handler
        }
      },
      start: async () => undefined,
      stop: () => undefined,
    }

    const plugin = new TelegramTransportPlugin({
      resolveAccountConfig: () => runtimeConfig,
      botFactory: () => fakeBot,
      autoStartPolling: false,
    })
    const inbound: unknown[] = []
    plugin.onInbound((event) => {
      inbound.push(event)
    })

    await plugin.connect('default')
    const handler = callbackHandler as ((ctx: any) => unknown) | null
    assert.ok(handler)
    await handler({
      callbackQuery: {
        id: 'cb-1',
        data: 'approve',
        from: { id: 42, first_name: 'Ada' },
        message: {
          message_id: 11,
          message_thread_id: 123,
          chat: { id: -100123, type: 'supergroup', title: 'Engineering' },
        },
      },
    })

    assert.equal((inbound[0] as any)?.message.type, 'card_callback')
    assert.equal((inbound[0] as any)?.message.text, 'approve')
    assert.equal((inbound[0] as any)?.message.id, 'cb-1')
    assert.equal((inbound[0] as any)?.thread.id, '123')
  })

  it('sends text with Telegram chat and thread ids', async () => {
    const sent: unknown[] = []
    const fakeBot = {
      api: {
        getMe: async () => ({ id: 1, is_bot: true, username: 'yolo_bot' }),
        sendMessage: async (...args: unknown[]) => {
          sent.push(args)
          return { message_id: 9 }
        },
      },
      on: () => undefined,
      start: async () => undefined,
      stop: () => undefined,
    }

    const plugin = new TelegramTransportPlugin({
      resolveAccountConfig: () => runtimeConfig,
      botFactory: () => fakeBot,
      autoStartPolling: false,
    })

    await plugin.connect('default')
    await plugin.send({
      deliveryId: 'cmd-1',
      conversationId: 'conv-1',
      bindingId: 'binding-1',
      transportId: 'telegram',
      accountId: 'default',
      audience: {
        kind: 'thread',
        externalChatId: '-100123',
        externalThreadId: '456',
      },
      payload: { kind: 'text', text: 'hello' },
      policy: {
        preferThread: true,
        splitLongText: true,
        allowCardFallback: true,
      },
    })

    assert.deepEqual(sent, [['-100123', 'hello', { message_thread_id: 456 }]])
  })

  it('sends text replies with Telegram reply parameters', async () => {
    const sent: unknown[] = []
    const fakeBot = {
      api: {
        getMe: async () => ({ id: 1, is_bot: true, username: 'yolo_bot' }),
        setMyCommands: async () => true,
        sendMessage: async (...args: unknown[]) => {
          sent.push(args)
          return { message_id: 9 }
        },
      },
      on: () => undefined,
      start: async () => undefined,
      stop: () => undefined,
    }

    const plugin = new TelegramTransportPlugin({
      resolveAccountConfig: () => runtimeConfig,
      botFactory: () => fakeBot,
      autoStartPolling: false,
    })

    await plugin.connect('default')
    await plugin.send({
      deliveryId: 'cmd-reply',
      conversationId: 'conv-1',
      bindingId: 'binding-1',
      transportId: 'telegram',
      accountId: 'default',
      audience: {
        kind: 'thread',
        externalChatId: '-100123',
        externalThreadId: '456',
      },
      replyContext: {
        replyToMessageId: '777',
      },
      payload: { kind: 'text', text: 'quoted reply' },
      policy: {
        preferThread: true,
        splitLongText: true,
        allowCardFallback: true,
      },
    })

    assert.deepEqual(sent, [
      [
        '-100123',
        'quoted reply',
        {
          message_thread_id: 456,
          reply_parameters: {
            message_id: 777,
            allow_sending_without_reply: true,
          },
        },
      ],
    ])
  })

  it('sends image file payloads as Telegram photos', async () => {
    const photos: unknown[] = []
    const fakeBot = {
      api: {
        getMe: async () => ({ id: 1, is_bot: true, username: 'yolo_bot' }),
        setMyCommands: async () => true,
        sendMessage: async () => ({ message_id: 9 }),
        sendPhoto: async (...args: unknown[]) => {
          photos.push(args)
          return { message_id: 10 }
        },
      },
      on: () => undefined,
      start: async () => undefined,
      stop: () => undefined,
    }

    const plugin = new TelegramTransportPlugin({
      resolveAccountConfig: () => runtimeConfig,
      botFactory: () => fakeBot,
      autoStartPolling: false,
    })

    await plugin.connect('default')
    const result = await plugin.send({
      deliveryId: 'image-1',
      conversationId: 'conv-1',
      bindingId: 'binding-1',
      transportId: 'telegram',
      accountId: 'default',
      audience: {
        kind: 'chat',
        externalChatId: '123456',
      },
      payload: {
        kind: 'file',
        attachmentId: 'photo-1',
        url: 'https://example.test/photo.jpg',
        mimeType: 'image/jpeg',
        fallbackText: 'photo fallback',
      },
      policy: {
        preferThread: false,
        splitLongText: true,
        allowCardFallback: true,
      },
    } as any)

    assert.equal(result.status, 'sent')
    assert.deepEqual(photos, [
      [
        '123456',
        'https://example.test/photo.jpg',
        {
          caption: 'photo fallback',
        },
      ],
    ])
  })

  it('sends interaction options as Telegram inline keyboard buttons', async () => {
    const sent: unknown[] = []
    const fakeBot = {
      api: {
        getMe: async () => ({ id: 1, is_bot: true, username: 'yolo_bot' }),
        setMyCommands: async () => true,
        sendMessage: async (...args: unknown[]) => {
          sent.push(args)
          return { message_id: 12 }
        },
      },
      on: () => undefined,
      start: async () => undefined,
      stop: () => undefined,
    }

    const plugin = new TelegramTransportPlugin({
      resolveAccountConfig: () => runtimeConfig,
      botFactory: () => fakeBot,
      autoStartPolling: false,
    })

    await plugin.connect('default')
    const capabilities = plugin.getCapabilities()
    await plugin.send({
      deliveryId: 'interaction-1',
      conversationId: 'conv-1',
      bindingId: 'binding-1',
      transportId: 'telegram',
      accountId: 'default',
      audience: {
        kind: 'chat',
        externalChatId: '123456',
      },
      payload: {
        kind: 'interaction',
        interactionId: 'approval-1',
        prompt: 'Approve deployment?',
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'reject', label: 'Reject' },
        ],
      },
      policy: {
        preferThread: false,
        splitLongText: true,
        allowCardFallback: true,
      },
    })

    assert.equal(capabilities.canRenderButtons, true)
    assert.equal(capabilities.canReceiveCardCallbacks, true)
    assert.deepEqual(sent, [
      [
        '123456',
        'Approve deployment?',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Approve', callback_data: 'approve' },
                { text: 'Reject', callback_data: 'reject' },
              ],
            ],
          },
        },
      ],
    ])
  })

  it('sends typing payload as Telegram chat action', async () => {
    const sent: unknown[] = []
    const actions: unknown[] = []
    const fakeBot = {
      api: {
        getMe: async () => ({ id: 1, is_bot: true, username: 'yolo_bot' }),
        sendMessage: async (...args: unknown[]) => {
          sent.push(args)
          return { message_id: 9 }
        },
        sendChatAction: async (...args: unknown[]) => {
          actions.push(args)
          return true
        },
      },
      on: () => undefined,
      start: async () => undefined,
      stop: () => undefined,
    }

    const plugin = new TelegramTransportPlugin({
      resolveAccountConfig: () => runtimeConfig,
      botFactory: () => fakeBot,
      autoStartPolling: false,
    })

    await plugin.connect('default')
    await plugin.send({
      deliveryId: 'typing-1',
      conversationId: 'conv-1',
      bindingId: 'binding-1',
      transportId: 'telegram',
      accountId: 'default',
      audience: {
        kind: 'thread',
        externalChatId: '-100123',
        externalThreadId: '456',
      },
      payload: { kind: 'typing' },
      policy: {
        preferThread: true,
        splitLongText: true,
        allowCardFallback: true,
      },
    })

    assert.deepEqual(sent, [])
    assert.deepEqual(actions, [['-100123', 'typing', { message_thread_id: 456 }]])
  })

  it('lists only Telegram platform targets when a query is provided', () => {
    const plugin = new TelegramTransportPlugin()
    const targets = plugin.listTargets({
      accountId: 'default',
      query: '-100123',
    })

    assert.deepEqual(targets.map((target) => target.externalChatId), ['-100123'])
    assert.equal(targets[0]?.description?.includes('Internal route ids'), true)
  })
})
