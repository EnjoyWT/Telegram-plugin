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
