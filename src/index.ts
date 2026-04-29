import {
  TELEGRAM_TRANSPORT_MANIFEST,
  TelegramTransportPlugin,
  resolveTelegramAccountConfig,
} from './telegram-transport.js'
import type {
  BuiltinPluginModule,
  ImTransportPlugin,
  TransportRegisterContext,
} from './piagent-types.js'

export const register = (ctx: TransportRegisterContext): ImTransportPlugin =>
  new TelegramTransportPlugin({
    logger: ctx.logger,
    resolveAccountConfig: (accountId) =>
      resolveTelegramAccountConfig(accountId, ctx.getAccountConfig?.(accountId) ?? null),
  })

export const telegramTransportModule: BuiltinPluginModule<
  ImTransportPlugin,
  TransportRegisterContext
> = {
  manifest: TELEGRAM_TRANSPORT_MANIFEST,
  register,
}

export default {
  register,
}
