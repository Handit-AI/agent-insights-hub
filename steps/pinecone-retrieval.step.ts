import { EventConfig, StepHandler, FlowContext } from '@motiadev/core'
import { z } from 'zod'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'
import { agentsTrackingConfig, traceWithHandit } from '../utils/handit-tracing'

// Define the input schema
const inputSchema = z.object({
  originalMessage: z.string(),
  processedMessage: z.string(),
  timestamp: z.string(),
  dateFilters: z.record(z.any()).optional(),
  metadataFilters: z.record(z.any()).optional(),
  _handidFlowId: z.string().optional(), // Flow ID for tracing
})

// Type for basic metadata
type EntryMetadata = {
  input: string
  output: string
  created_at: string
  date_str?: string
  time_str?: string
  year?: number
  month?: number
  day?: number
  environment?: string
  status?: string
}

export const config: EventConfig = {
  type: 'event',
  name: 'Pinecone Retrieval',
  description: 'Retrieves similar documents from Pinecone vector DB',
  subscribes: ['fetch-context'],
  emits: ['context-retrieved'],
  input: inputSchema,
  flows: ['agent-chat'],
}

export const handler: StepHandler<typeof config> = async (input, context: FlowContext) => {
  const { logger, emit } = context
  
  // Extract the flow ID from the input
  const flowId = input._handidFlowId
  logger.info('Retrieving context from Pinecone', { 
    message: input.processedMessage,
    dateFilters: input.dateFilters,
    metadataFilters: input.metadataFilters,
    flowId
  })
  
  try {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    
    // Initialize Pinecone client
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || '',
    })
    
    // Function to generate embedding using OpenAI
    const generateEmbedding = async (text: string): Promise<number[]> => {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      })
      
      return response.data[0].embedding
    }
    
    // Function to build Pinecone filter expression based on extracted filters
    const buildFilterExpression = (dateFilters?: Record<string, any>, metadataFilters?: Record<string, any>): Record<string, any> | undefined => {
      const filters: Record<string, any> = {}
      
      if (dateFilters) {
        // Add date-specific filters
        if (dateFilters.year) filters.year = dateFilters.year
        if (dateFilters.month) filters.month = dateFilters.month
        if (dateFilters.day) filters.day = dateFilters.day
        if (dateFilters.date_str) filters.date_str = dateFilters.date_str
      }
      
      if (metadataFilters) {
        // Add metadata-specific filters
        if (metadataFilters.environment) filters.environment = metadataFilters.environment
        if (metadataFilters.status) filters.status = metadataFilters.status
      }
      
      return Object.keys(filters).length > 0 ? { $and: Object.entries(filters).map(([key, value]) => ({ [key]: value })) } : undefined
    }
    
    // Generate embedding for the processed message, with Handit tracing
    
    const embedding = await generateEmbedding(input.processedMessage)
    
    // Get Pinecone index
    const indexName = process.env.PINECONE_INDEX || 'agent-knowledge'
    const index = pinecone.Index(indexName)
    
    // Build filter expression
    const filterExpression = buildFilterExpression(input.dateFilters, input.metadataFilters)
    logger.info('Using Pinecone filter expression', { filterExpression })
    
    // Define the Pinecone query function
    const queryPinecone = async (vector: number[], filter?: Record<string, any>): Promise<any> => {
      const queryOptions = {
        vector,
        topK: 5,
        includeMetadata: true,
        filter,
      }
      
      return index.query(queryOptions)
    }
    
    // Execute Pinecone query with Handit tracing
    const tracedPineconeQuery = traceWithHandit(
      agentsTrackingConfig.metaAgentKnowledgeBase.ragRetrieval,
      flowId,
      queryPinecone
    )
    
    const results = await tracedPineconeQuery(embedding, filterExpression)
    
    // Process results
    const context = results.matches?.map((match: any) => {
      const metadata = match.metadata as any;
      return {
        input: metadata.input,
        output: metadata.output,
        created_at: metadata.created_at,
        score: match.score,
        problem: metadata.problem,
        solution: metadata.solution,
        type: metadata.type,
      }
    })
    
    // Log results
    logger.info('Context retrieved from Pinecone', { 
      count: context?.length ?? 0,
      flowId
    })
    
    // Emit the retrieved context to the next step
    await emit({
      topic: 'context-retrieved',
      data: {
        originalMessage: input.originalMessage,
        processedMessage: input.processedMessage,
        timestamp: input.timestamp,
        context: context || [],
        dateFilters: input.dateFilters,
        metadataFilters: input.metadataFilters,
        _handidFlowId: flowId, // Pass the flow ID to the next step
      },
    })
  } catch (error) {
    logger.error('Error retrieving context from Pinecone', { error })
    
    // Continue without context on error
    await emit({
      topic: 'context-retrieved',
      data: {
        originalMessage: input.originalMessage,
        processedMessage: input.processedMessage,
        timestamp: input.timestamp,
        context: [],
        _handidFlowId: flowId, // Still pass the flow ID even on error
      },
    })
  }
} 