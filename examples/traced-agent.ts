/**
 * Example of using Handit tracing for a complete agent workflow
 * 
 * This example shows how to wrap multiple steps in a complete agent workflow
 * using Handit's tracing capabilities.
 */

import { startAgentTracing } from '@handit.ai/node';
import { agentsTrackingConfig } from '../utils/handit-tracing';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

// Create clients for external services
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || '' 
});

const pinecone = new Pinecone({ 
  apiKey: process.env.PINECONE_API_KEY || '' 
});

// Define the agent workflow
async function metaAgentWorkflow(input: { message: string, timestamp: string }) {
  try {
    // Step 1: Preprocess the message
    console.log('Preprocessing message...');
    const processedMessage = input.message.trim();
    
    // Step 2: Extract filters using LLM
    console.log('Extracting filters...');
    const filterResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        { role: "system", content: "Extract date and metadata filters from this query." },
        { role: "user", content: `Extract filters from: "${processedMessage}"` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });
    
    const filterContent = filterResponse.choices[0].message.content || '{}';
    const filters = JSON.parse(filterContent);
    
    // Step 3: Retrieve context from Pinecone
    console.log('Retrieving context from Pinecone...');
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: processedMessage
    });
    
    const embedding = embeddingResponse.data[0].embedding;
    const index = pinecone.Index(process.env.PINECONE_INDEX || 'handit-agent-insights');
    
    const queryOptions: any = {
      vector: embedding,
      topK: 5,
      includeMetadata: true,
    };
    
    if (filters.filter) {
      queryOptions.filter = filters.filter;
    }
    
    const queryResponse = await index.query(queryOptions);
    const relevantContext = queryResponse.matches || [];
    
    // Step 4: Generate response with OpenAI
    console.log('Generating response...');
    const contextText = relevantContext.map(match => {
      const metadata = match.metadata || {};
      return `Type: ${metadata.type || 'unknown'}, Content: ${JSON.stringify(metadata).substring(0, 100)}...`;
    }).join('\n\n');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant providing insights about AI agents." },
        { role: "user", content: `Based on the following context, please answer: ${input.message}\n\nContext:\n${contextText}` }
      ],
      temperature: 0.7,
    });
    
    const responseText = response.choices[0].message.content || '';
    
    // Return the final result
    console.log('Response generated successfully!');
    return {
      originalMessage: input.message,
      generatedResponse: responseText,
      timestamp: input.timestamp
    };
  } catch (error) {
    console.error('Error in agent workflow:', error);
    return {
      originalMessage: input.message,
      generatedResponse: "I'm sorry, I encountered an error while processing your request.",
      timestamp: input.timestamp,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Wrap the entire workflow with Handit tracing
const tracedAgent = startAgentTracing(metaAgentWorkflow);

// Example usage
async function runExample() {
  const result = await tracedAgent({
    message: "What were the common failures in the production environment yesterday?",
    timestamp: new Date().toISOString()
  });
  
  console.log("Agent Response:", result.generatedResponse);
}

// Only run if this file is executed directly
if (require.main === module) {
  runExample().catch(console.error);
} 