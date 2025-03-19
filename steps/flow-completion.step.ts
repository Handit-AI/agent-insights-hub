import { EventConfig, StepHandler, FlowContext } from '@motiadev/core'
import { z } from 'zod'
import { endAgentTracingHandit } from '../utils/handit-tracing'

// Define the input schema
const inputSchema = z.object({
  originalMessage: z.string(),
  processedMessage: z.string(),
  timestamp: z.string(),
  response: z.string(),
  context: z.array(z.any()).optional(),
  _handidFlowId: z.string().optional(), // Flow ID for tracing
})

export const config: EventConfig = {
  type: 'event',
  name: 'Flow Completion',
  description: 'Completes the flow and ends the Handit tracing session',
  subscribes: ['response-generated'],
  emits: [],
  input: inputSchema,
  flows: ['agent-chat'],
}

export const handler: StepHandler<typeof config> = async (input, context: FlowContext) => {
  const { logger } = context
  
  // Extract flow ID for tracing
  const flowId = input._handidFlowId
  logger.info('Completing flow', { flowId })
  
  try {
    // End the Handit tracing session if a flow ID is present
    if (flowId) {
      logger.info('Ending Handit tracing session', { flowId })
      await endAgentTracingHandit(flowId)
      logger.info('Handit tracing session ended successfully', { flowId })
    } else {
      logger.warn('No flow ID found, skipping Handit tracing session end')
    }
    
    // Log flow completion
    logger.info('Flow completed successfully', {
      originalMessageLength: input.originalMessage.length,
      processedMessageLength: input.processedMessage.length,
      responseLength: input.response.length,
      contextItemsCount: input.context?.length || 0
    })
  } catch (error) {
    logger.error('Error ending Handit tracing session', { error, flowId })
  }
} 