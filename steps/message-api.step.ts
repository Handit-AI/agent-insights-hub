import { ApiRouteConfig, StepHandler } from '@motiadev/core'
import { z } from 'zod'

const inputSchema = z.object({
  message: z.string().describe('The user message/query'),
})

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'Agent Chat API',
  description: 'API endpoint for interacting with the HandIt agent chat',
  path: '/chat',
  method: 'POST',
  emits: ['message-received'],
  bodySchema: inputSchema,
  flows: ['agent-chat'],
}

export const handler: StepHandler<typeof config> = async (req, { logger, emit }) => {
  logger.info('Processing chat message', { message: req.body.message })

  await emit({
    topic: 'message-received',
    data: { 
      message: req.body.message,
      timestamp: new Date().toISOString(),
    },
  })

  return {
    status: 200,
    body: { status: 'processing', message: 'Your message is being processed' },
  }
} 