import { EventConfig, StepHandler } from '@motiadev/core'
import { z } from 'zod'

const inputSchema = z.object({
  originalMessage: z.string(),
  generatedResponse: z.string(),
  timestamp: z.string(),
  error: z.string().optional()
})

export const config: EventConfig = {
  type: 'event',
  name: 'Response Handler',
  description: 'Handles the final response from the LLM and can save it or trigger other actions',
  subscribes: ['response-ready'],
  emits: [],
  input: inputSchema,
  flows: ['agent-chat'],
}

export const handler: StepHandler<typeof config> = async (input, { logger, traceId, state }) => {
  logger.info('Processing final response', { 
    message: input.originalMessage, 
    timestamp: input.timestamp 
  })

  // Save the conversation to state (could be persisted to a database)
  await state.set(traceId, 'last_conversation', {
    query: input.originalMessage,
    response: input.generatedResponse,
    timestamp: input.timestamp,
    hasError: !!input.error,
  })

  // Log the complete conversation
  logger.info('Conversation completed', {
    query: input.originalMessage,
    response: input.generatedResponse,
    timestamp: input.timestamp
  })

  // Here you could:
  // 1. Save the conversation to a database
  // 2. Update analytics about agent usage
  // 3. Trigger notifications
  // 4. etc.
} 