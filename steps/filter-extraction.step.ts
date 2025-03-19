import { EventConfig, StepHandler, FlowContext } from '@motiadev/core'
import { z } from 'zod'
import OpenAI from 'openai'
import { agentsTrackingConfig, traceWithHandit } from '../utils/handit-tracing'

// Define the input schema
const inputSchema = z.object({
  originalMessage: z.string(),
  processedMessage: z.string(),
  timestamp: z.string(),
  _handidFlowId: z.string().optional(), // Include flow ID for tracing
})

// Define the output schema for extracted filters
const filterSchema = z.object({
  dateFilters: z.record(z.any()).optional(),
  metadataFilters: z.record(z.any()).optional(),
  extractedQuery: z.string(),
})

// Define the input type from the schema
type InputType = z.infer<typeof inputSchema>
type FilterResponseType = z.infer<typeof filterSchema>

export const config: EventConfig = {
  type: 'event',
  name: 'LLM Filter Extraction',
  description: 'Uses LLM to extract date and metadata filters from user messages',
  subscribes: ['preprocess-complete'],
  emits: ['fetch-context'],
  input: inputSchema,
  flows: ['agent-chat'],
}

export const handler: StepHandler<typeof config> = async (input: InputType, context: FlowContext) => {
  const { logger, emit } = context;
  logger.info('Extracting filters using LLM', { message: input.processedMessage });

  // Extract the flow ID from input if available
  const flowId = input._handidFlowId;
  logger.info('Continuing with flow', { flowId });

  try {
    // Get API key from environment variables
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    // Check if API key is available
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not found in environment variables');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    
    // The system prompt instructs the LLM on how to extract filters
    const systemPrompt = `You are a filter extraction assistant. Your job is to analyze a user query and extract any date filters and metadata filters.
Extract the following types of filters:

Date filters can include:
- Specific dates (e.g., "2023-05-15", "May 15, 2023")
- Relative dates (e.g., "yesterday", "today", "last week", "this month", "last month")
- Month references (e.g., "January", "February", etc.)
- Year references (e.g., "2023", "this year", "last year")
- Date ranges (e.g., "between March and June", "last 7 days")

Metadata filters can include:
- Environment mentions (e.g., "production", "development", "staging", "test")
- Status mentions (e.g., "success", "failed", "error", "pending", "completed")
- Correctness filters (e.g., "correct responses", "incorrect outputs", "wrong answers")

Your response must be a valid JSON object with the following structure:
{
  "dateFilters": {/* date filter parameters */} or null if no date filters found,
  "metadataFilters": {/* metadata filter parameters */} or null if no metadata filters found,
  "extractedQuery": "the query with filter references removed or simplified for semantic search"
}

For date filters, extract specific properties when possible:
- For exact dates: { "date_str": "YYYY-MM-DD" }
- For months: { "month": 1-12 } (where 1 = January, 12 = December)
- For years: { "year": YYYY }
- For date ranges: { "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } }

Always normalize dates to ISO format (YYYY-MM-DD).`;

    // Define the filter extraction function
    const extractFilters = async (msg: string, prompt: string): Promise<FilterResponseType> => {
      // Call OpenAI API to extract filters
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125", // Using 3.5 for speed and cost efficiency
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Extract filters from this query: "${msg}"` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1, // Lower temperature for more deterministic responses
      });
      
      // Parse the LLM's response
      if (response && response.choices && response.choices.length > 0 && response.choices[0].message) {
        const content = response.choices[0].message.content || '{}';
        
        try {
          const answer = JSON.parse(content) as FilterResponseType;
          answer.extractedQuery = msg;
          return answer;
        } catch (parseError) {
          logger.error('Error parsing LLM filter response', { error: parseError });
          // Fall back to original message if parsing fails
          return {
            dateFilters: undefined,
            metadataFilters: undefined,
            extractedQuery: msg
          };
        }
      } else {
        logger.warn('LLM returned empty or invalid response');
        // Fall back to original message if LLM fails
        return {
          dateFilters: undefined,
          metadataFilters: undefined,
          extractedQuery: msg
        };
      }
    };
    
    // Wrap the extraction function with Handit tracing
    const tracedExtraction = traceWithHandit(
      agentsTrackingConfig.metaAgentKnowledgeBase.llmFiltersExtraction,
      flowId,
      extractFilters
    );
    
    // Execute the traced function
    const extractedFilters = await tracedExtraction(input.processedMessage, systemPrompt);
    
    logger.info('Filters extracted successfully', { 
      dateFilters: extractedFilters.dateFilters,
      metadataFilters: extractedFilters.metadataFilters,
      extractedQuery: extractedFilters.extractedQuery
    });
    
    // Proceed to fetch context with extracted filters
    await emit({
      topic: 'fetch-context',
      data: {
        originalMessage: input.originalMessage,
        processedMessage: extractedFilters.extractedQuery || input.processedMessage,
        timestamp: input.timestamp,
        dateFilters: extractedFilters.dateFilters,
        metadataFilters: extractedFilters.metadataFilters,
        _handidFlowId: flowId, // Pass the flow ID to the next step
      },
    });
    
  } catch (error) {
    logger.error('Error extracting filters with LLM', { error });
    
    // Fall back to the original message if filter extraction fails
    await emit({
      topic: 'fetch-context',
      data: {
        originalMessage: input.originalMessage,
        processedMessage: input.processedMessage,
        timestamp: input.timestamp,
        _handidFlowId: flowId, // Still pass the flow ID even on error
      },
    });
  }
} 