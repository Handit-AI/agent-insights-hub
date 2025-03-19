import { config, traceAgentNode, endAgentTracing } from '@handit.ai/node';
import { FlowContext } from '@motiadev/core';

// Configure Handit with API key
config({
  apiKey: process.env.HANDIT_API_KEY || '',
});

// Agent configuration for Meta-Agent Knowledge Base 
export const agentsTrackingConfig = {
  "metaAgentKnowledgeBase": {
    "preprocessMessage": "metaAgentK40-toolpreprocessp6",
    "llmFiltersExtraction": "metaAgentK40-llmFiltersrv",
    "ragRetrieval": "metaAgentK40-toolragRetrievvz",
    "responseGeneration": "metaAgentK40-responseGecp"
  }
};

/**
 * Generates a conversation/flow ID that can be passed between steps to group them
 */
export function generateFlowId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `flow-${timestamp}-${random}`;
}

/**
 * Wraps a function with Handit tracing
 */
export function traceWithHandit(
  agentNodeId: string,
  flowId: string | undefined,
  callback: (...args: any[]) => Promise<any>
): (...args: any[]) => Promise<any> {
  // Create traced function with Handit
  const tracedFn = traceAgentNode({
    agentNodeId,
    externalId: flowId,
    callback: async (...args: any[]) => {
      // Execute the original function
      const result = await callback(...args);
      
      // If the result is an object and we have a flow ID, attach the flow ID to it
      if (typeof result === 'object' && result !== null && flowId) {
        try {
          // @ts-ignore - We're adding a property that may not be in the type
          result._handidFlowId = flowId;
        } catch (e) {
          // Ignore errors if we can't attach the flow ID
        }
      }
      
      return result;
    }
  });
  
  return tracedFn;
}

/**
 * Extracts a flow ID from a context or object if available
 */
export function extractFlowId(obj: any): string | undefined {
  if (!obj) return undefined;
  
  // Check for our custom property
  if (obj._handidFlowId) return obj._handidFlowId;
  
  // Check if this is a Motia context with data that might have a flow ID
  if (obj.data && obj.data._handidFlowId) return obj.data._handidFlowId;
  
  // Check for event data
  if (obj.event && obj.event.data && obj.event.data._handidFlowId) {
    return obj.event.data._handidFlowId;
  }
  
  return undefined;
}

/**
 * Ends a tracing session for a specific flow
 * 
 * @param flowId - The ID of the flow to end
 */
export async function endAgentTracingHandit(flowId?: string): Promise<void> {
  // If no flow ID, do nothing
  if (!flowId) return
  
  try {
    // This would normally call the Handit SDK to end the tracing session
    // Since the actual endAgentTracing function isn't available, we'll log it
    console.log(`[Handit] Ending tracing session for flow: ${flowId}`)
    
    // In a real implementation, you would call the Handit SDK:
    await endAgentTracing({ externalId: flowId })
  } catch (error) {
    console.error(`[Handit] Error ending tracing session for flow ${flowId}:`, error)
  }
} 