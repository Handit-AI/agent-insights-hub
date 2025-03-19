import { EventConfig, StepHandler, FlowContext } from '@motiadev/core'
import { z } from 'zod'
import { agentsTrackingConfig, generateFlowId, traceWithHandit } from '../utils/handit-tracing'

// Define the input schema
const inputSchema = z.object({
  message: z.string(),
  timestamp: z.string().optional(),
})

export const config: EventConfig = {
  type: 'event',
  name: 'Preprocess Message',
  description: 'Preprocess user message before processing',
  subscribes: ['message-received'],
  emits: ['preprocess-complete'],
  input: inputSchema,
  flows: ['agent-chat'],
}

export const handler: StepHandler<typeof config> = async (input, context: FlowContext) => {
  const { logger, emit } = context
  
  // Generate a flow ID for this conversation
  const flowId = generateFlowId()
  logger.info('Processing message', { message: input.message, flowId })
  
  try {
    // Preprocess message - remove extra whitespace, normalize case, etc.
    const preprocessMessage = async (message: string): Promise<string> => {
      // Basic preprocessing logic
      const preprocessed = message.trim()
      
      // In a real implementation, you might do more sophisticated preprocessing
      // like entity recognition, intent classification, etc.
      
      return preprocessed
    }
    
    // Wrap the preprocessing function with Handit tracing
    const tracedPreprocessing = traceWithHandit(
      agentsTrackingConfig.metaAgentKnowledgeBase.preprocessMessage,
      flowId,
      preprocessMessage
    )
    
    // Process the message
    const processedMessage = await tracedPreprocessing(input.message)
    
    // Emit the processed message to the next step
    await emit({
      topic: 'preprocess-complete',
      data: {
        originalMessage: input.message,
        processedMessage,
        timestamp: input.timestamp || new Date().toISOString(),
        _handidFlowId: flowId, // Include the flow ID for tracing
      },
    })
  } catch (error) {
    logger.error('Error preprocessing message', { error })
    
    // Even on error, continue with the original message
    await emit({
      topic: 'preprocess-complete',
      data: {
        originalMessage: input.message,
        processedMessage: input.message, // Use original message on error
        timestamp: input.timestamp || new Date().toISOString(),
        _handidFlowId: flowId, // Still include the flow ID even on error
      },
    })
  }
} 