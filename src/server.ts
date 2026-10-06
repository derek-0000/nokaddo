import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { assertServerConfig } from '#/lib/server-config'

assertServerConfig()

const fetch = createStartHandler(defaultStreamHandler)

export default { fetch }
