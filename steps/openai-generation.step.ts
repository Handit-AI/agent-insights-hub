import { EventConfig, StepHandler, FlowContext } from '@motiadev/core'
import { z } from 'zod'
import OpenAI from 'openai'
import { agentsTrackingConfig, traceWithHandit } from '../utils/handit-tracing'

// Define the input schema
const inputSchema = z.object({
  originalMessage: z.string(),
  processedMessage: z.string(),
  timestamp: z.string(),
  context: z.array(z.object({
    input: z.string(),
    output: z.string(),
    created_at: z.string(),
    score: z.number()
  })).optional(),
  _handidFlowId: z.string().optional(), // Flow ID for tracing
})

export const config: EventConfig = {
  type: 'event',
  name: 'OpenAI Response Generation',
  description: 'Generates responses using OpenAI with context-aware prompting',
  subscribes: ['context-retrieved'],
  emits: ['response-generated'],
  input: inputSchema,
  flows: ['agent-chat'],
}

export const handler: StepHandler<typeof config> = async (input, context: FlowContext) => {
  const { logger, emit } = context
  
  // Extract flow ID for tracing
  const flowId = input._handidFlowId
  logger.info('Generating response using OpenAI', { 
    message: input.processedMessage, 
    contextCount: input.context?.length || 0,
    flowId
  })
  
  try {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    
    // Format context for the prompt
    const formatContext = (context: any[] = []) => {
      if (!context || context.length === 0) {
        return "No relevant previous conversations found.";
      }
      
      return context
        .map((item) => 
          {
            if (item.type === 'insight') {
              return `--- Previous Insight ---
Problem: ${item.problem}
Solution: ${item.solution}
Date: ${item.created_at}
Similarity Score: ${item.score.toFixed(2)}
-------------------------`;
            } else {
              return `--- Previous User Query ---
User: ${item.input}
Agent: ${item.output}
Date: ${item.created_at}
Similarity Score: ${item.score.toFixed(2)}
-------------------------`;
            }
        })
        .join("\n\n");
    }
    
    // Generate response function
    const generateResponse = async (promptText: string, contextText: string): Promise<string> => {
      // System prompt including context awareness
      const systemPrompt = `You are an AI assistant that helps users with their questions. Below is some context from previous conversations that may be relevant to the current question. Use this context to inform your response, but still respond directly to the user's current query.

${contextText}

IMPORTANT GUIDELINES:
1. If the context provides information relevant to the query, use it to inform your answer.
2. If the context is not relevant to the current query, simply respond to the user's query without mentioning the irrelevant context.
3. Do not explicitly mention that you're using previous conversations unless directly asked.
4. Maintain a helpful, informative, and friendly tone.
5. If you're unsure or the question is outside your knowledge base, be honest about your limitations.`;

      // Call OpenAI API to generate response
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // You can change to another model if needed
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: promptText }
        ],
        temperature: 0.7,
      });
      
      // Extract and return the generated response
      return response.choices[0].message?.content || "I apologize, but I couldn't generate a response. Please try again.";
    }
    
    // Format context string
    const contextString = formatContext(input.context);
    
    // Wrap the generation function with Handit tracing
    const tracedGeneration = traceWithHandit(
      agentsTrackingConfig.metaAgentKnowledgeBase.responseGeneration,
      flowId,
      generateResponse
    );
    
    // Execute the traced function
    const generatedResponse = await tracedGeneration(input.processedMessage, contextString);
    
    // Save the generated response in the context store if required
    // This part would integrate with the Pinecone data upload script later
    
    // Log the response generation
    logger.info('Response generated successfully', { 
      messageLength: input.processedMessage.length,
      responseLength: generatedResponse.length,
      flowId
    });
    
    // End the flow by emitting the final response
    await emit({
      topic: 'response-generated',
      data: {
        originalMessage: input.originalMessage,
        processedMessage: input.processedMessage,
        timestamp: input.timestamp,
        response: generatedResponse,
        context: input.context,
        _handidFlowId: flowId, // Pass the flow ID to any potential next steps
      },
    });
  } catch (error) {
    logger.error('Error generating response', { error });
    
    // Provide a fallback response
    const fallbackResponse = "I apologize, but I encountered an error while generating a response. Please try again later.";
    
    await emit({
      topic: 'response-generated',
      data: {
        originalMessage: input.originalMessage,
        processedMessage: input.processedMessage,
        timestamp: input.timestamp,
        response: fallbackResponse,
        error: error instanceof Error ? error.message : 'Failed to generate response',
        _handidFlowId: flowId, // Still pass the flow ID even on error
      },
    });
  }
} 