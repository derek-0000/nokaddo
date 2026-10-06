import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { appErrorSerializationAdapter } from '#/lib/errors'

// When a start instance is present, TanStack Start stops injecting its built-in
// CSRF middleware, so we re-add it ourselves to keep server functions protected.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
  // Preserve typed `AppError`s across the server-function boundary. Without a
  // custom adapter, Start's default serializer keeps only the error `message`.
  serializationAdapters: [appErrorSerializationAdapter],
}))
