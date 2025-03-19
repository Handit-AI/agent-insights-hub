import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
// These need to be installed with:
// npm install csv-parse dotenv
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Define types
interface Entry {
  id: string;
  input: string;
  output: string;
  parameters: string;
  is_correct: string;
  created_at: string;
  updated_at: string;
  model_id: string;
  environment?: string;
  status?: string;
  metric_processed?: string;
  processed?: string;
  actual?: string;
  predicted?: string;
  auto_evaluation_processed?: string;
  original_log_id?: string;
  agent_log_id?: string;
  // Add other fields as needed
}

interface Insight {
  problem: string;
  solution: string;
  category?: string;
  created_at?: string;
  // Add other fields as needed
}

interface ProcessedMessage {
  role: string;
  content: string;
}

interface ProcessedEntry {
  id: string;
  messages: ProcessedMessage[];
  output: string;
  is_correct: boolean;
  created_at: string;
  updated_at?: string;
  model_id: string;
  environment?: string;
  status?: string;
  // Add other metadata
  date_str?: string;    // Standardized date string YYYY-MM-DD
  time_str?: string;    // Standardized time string HH:MM:SS
  year?: number;        // Extracted year
  month?: number;       // Extracted month
  day?: number;         // Extracted day
  // Add other fields as needed
}

// Define Pinecone-compatible metadata format
// Only strings, numbers, booleans, and arrays of strings are allowed
type PineconeMetadataValue = string | number | boolean | string[];
interface PineconeMetadata {
  [key: string]: PineconeMetadataValue;
}

// Helper function to extract and standardize date components
function extractDateComponents(dateStr: string): { 
  date_str: string, 
  time_str: string, 
  year: number, 
  month: number, 
  day: number,
  hour: number,
  minute: number,
  day_of_week: number
} | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return {
      date_str: date.toISOString().split('T')[0],
      time_str: date.toISOString().split('T')[1].split('.')[0],
      year: date.getFullYear(),
      month: date.getMonth() + 1, // 1-12 instead of 0-11
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      day_of_week: date.getDay() // 0 = Sunday, 6 = Saturday
    };
  } catch (e) {
    console.error('Error parsing date:', dateStr, e);
    return null;
  }
}

async function main() {
  try {
    // Initialize OpenAI and Pinecone clients
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });

    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || '',
    });

    // Check if index exists or create it
    const indexName = process.env.PINECONE_INDEX || 'handit-agent-insights';
    const dimension = 1536; // Dimension for text-embedding-ada-002

    const indexes = await pinecone.listIndexes();
    const indexNames = indexes.indexes?.map(index => index.name) || [];
    
    if (!indexNames.includes(indexName)) {
      console.log(`Creating index: ${indexName}`);
      await pinecone.createIndex({
        name: indexName,
        dimension: dimension,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      // Wait for index to be ready
      console.log('Waiting for index to be ready...');
      await new Promise(resolve => setTimeout(resolve, 60000));
    }

    const index = pinecone.Index(indexName);

    // Read entries CSV file
    const entriesFilePath = process.env.ENTRIES_CSV_PATH || './data/file_classifier_entries_2.csv';
    const entriesFileContent = fs.readFileSync(entriesFilePath, { encoding: 'utf-8' });
    const entriesRecords = parse(entriesFileContent, {
      columns: true,
      skip_empty_lines: true,
    }) as Entry[];

    console.log(`Read ${entriesRecords.length} entries from CSV`);

    // Read insights CSV file if it exists
    let insightsRecords: Insight[] = [];
    const insightsFilePath = process.env.INSIGHTS_CSV_PATH || './data/insights.csv';
    
    try {
      if (fs.existsSync(insightsFilePath)) {
        const insightsFileContent = fs.readFileSync(insightsFilePath, { encoding: 'utf-8' });
        insightsRecords = parse(insightsFileContent, {
          columns: true,
          skip_empty_lines: true,
        }) as Insight[];
        console.log(`Read ${insightsRecords.length} insights from CSV`);
      } else {
        console.log(`Insights file not found at ${insightsFilePath}. Skipping insights processing.`);
      }
    } catch (error) {
      console.error(`Error reading insights file: ${error}. Continuing without insights.`);
    }

    // Process entries
    const processedEntries: ProcessedEntry[] = [];
    for (const entry of entriesRecords) {
      try {
        // Parse input JSON
        const inputData = JSON.parse(entry.input);
        const messages = inputData.messages || [];
        
        // Filter and process messages
        const processedMessages: ProcessedMessage[] = [];
        
        for (const message of messages) {
          // Skip messages with type=image_url
          if (message.type === 'image_url') continue;
          
          // Process based on role
          if (message.role === 'system') {
            processedMessages.push({
              role: 'system',
              content: message.content,
            });
          } else if (message.role === 'user') {
            // For user messages, content might be an array
            if (Array.isArray(message.content)) {
              // Filter out content items with file type
              const filteredContent = message.content
                .filter((item: any) => item.type !== 'file')
                .map((item: any) => item.text || item.content || '')
                .join(' ');
              
              if (filteredContent) {
                processedMessages.push({
                  role: 'user',
                  content: filteredContent,
                });
              }
            } else {
              // Content is a string
              processedMessages.push({
                role: 'user',
                content: message.content,
              });
            }
          }
        }
        
        // Extract date components for filtering
        const dateComponents = extractDateComponents(entry.created_at);
        
        // Add to processed entries if we have messages
        if (processedMessages.length > 0) {
          const processedEntry: ProcessedEntry = {
            id: entry.id,
            messages: processedMessages,
            output: entry.output,
            is_correct: entry.is_correct.toLowerCase() === 'true',
            created_at: entry.created_at,
            updated_at: entry.updated_at,
            model_id: entry.model_id,
          };
          
          // Add optional fields if they exist
          if (entry.environment) processedEntry.environment = entry.environment;
          if (entry.status) processedEntry.status = entry.status;
          
          // Add date components if successfully parsed
          if (dateComponents) {
            processedEntry.date_str = dateComponents.date_str;
            processedEntry.time_str = dateComponents.time_str;
            processedEntry.year = dateComponents.year;
            processedEntry.month = dateComponents.month;
            processedEntry.day = dateComponents.day;
          }
          
          processedEntries.push(processedEntry);
        }
      } catch (error) {
        console.error(`Error processing entry ${entry.id}:`, error);
      }
    }

    console.log(`Processed ${processedEntries.length} entries`);

    // Batch upsert to Pinecone
    const batchSize = 100;
    const batches = Math.ceil(processedEntries.length / batchSize);

    console.log(`Uploading entries to Pinecone in ${batches} batches...`);

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, processedEntries.length);
      const batch = processedEntries.slice(start, end);
      
      console.log(`Processing batch ${i + 1}/${batches} with ${batch.length} entries...`);
      
      // Create vectors for this batch
      const vectors = await Promise.all(
        batch.map(async (entry) => {
          // Combine messages into a single text for embedding
          const text = entry.messages
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
            
          // Generate embedding
          const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: text,
          });
          
          const embedding = embeddingResponse.data[0].embedding;
          
          // Create metadata that's compatible with Pinecone
          // Note: Pinecone only accepts strings, numbers, booleans, and arrays of strings
          const metadata: PineconeMetadata = {
            type: 'entry',
            // Serialize messages as JSON string
            messagesJson: JSON.stringify(entry.messages),
            output: entry.output,
            is_correct: entry.is_correct,
            created_at: entry.created_at,
            model_id: entry.model_id,
            input_text: text,
          };
          
          // Add date-related metadata for filtering
          if (entry.date_str) metadata.date_str = entry.date_str;
          if (entry.time_str) metadata.time_str = entry.time_str;
          if (entry.year !== undefined) metadata.year = entry.year;
          if (entry.month !== undefined) metadata.month = entry.month;
          if (entry.day !== undefined) metadata.day = entry.day;
          
          // Add other optional metadata
          if (entry.environment) metadata.environment = entry.environment;
          if (entry.status) metadata.status = entry.status;
          if (entry.updated_at) metadata.updated_at = entry.updated_at;
          
          // The as any cast is needed due to TypeScript being stricter than the actual
          // Pinecone API requirements
          return {
            id: entry.id,
            values: embedding,
            metadata: metadata,
          } as any;
        })
      );
      
      // Upsert vectors to Pinecone
      await index.upsert(vectors);
      
      console.log(`Batch ${i + 1}/${batches} completed`);
    }

    // Process and upload insights
    console.log('Processing insights...');
    
    const insightVectors = await Promise.all(
      insightsRecords.map(async (insight, idx) => {
        const text = `Problem: ${insight.problem}\nSolution: ${insight.solution}`;
        
        // Generate embedding
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: text,
        });
        
        const embedding = embeddingResponse.data[0].embedding;
        
        const metadata: PineconeMetadata = {
          type: 'insight',
          problem: insight.problem,
          solution: insight.solution,
        };
        
        // Add category if available
        if (insight.category) metadata.category = insight.category;
        
        // Add date information if available
        if (insight.created_at) {
          metadata.created_at = insight.created_at;
          
          const dateComponents = extractDateComponents(insight.created_at);
          if (dateComponents) {
            metadata.date_str = dateComponents.date_str;
            metadata.year = dateComponents.year;
            metadata.month = dateComponents.month;
            metadata.day = dateComponents.day;
          }
        }
        
        // Cast as any to avoid TypeScript errors
        return {
          id: `insight-${idx}`,
          values: embedding,
          metadata: metadata,
        } as any;
      })
    );
    
    // Upsert insight vectors to Pinecone
    if (insightVectors.length > 0) {
      console.log(`Uploading ${insightVectors.length} insights to Pinecone...`);
      await index.upsert(insightVectors);
      console.log('Insights uploaded successfully');
    }

    console.log('Data upload to Pinecone completed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 