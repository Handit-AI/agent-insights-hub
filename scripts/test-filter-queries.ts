import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment variables
dotenv.config({ path: '../.env' });

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

// Helper function to extract date patterns from query
function extractDateFilters(query: string) {
  const filters: Record<string, any> = {};
  
  // Match exact date pattern (YYYY-MM-DD)
  const exactDateMatch = query.match(/(\d{4}-\d{2}-\d{2})/);
  if (exactDateMatch) {
    filters.date_str = exactDateMatch[1];
    return filters;
  }
  
  // Check for "yesterday" pattern
  if (query.toLowerCase().includes('yesterday')) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    filters.date_str = yesterday.toISOString().split('T')[0];
    return filters;
  }
  
  // Check for "today" pattern
  if (query.toLowerCase().includes('today')) {
    const today = new Date();
    filters.date_str = today.toISOString().split('T')[0];
    return filters;
  }
  
  // Check for "last week" pattern
  if (query.toLowerCase().includes('last week')) {
    const today = new Date();
    const lastWeekStart = new Date();
    lastWeekStart.setDate(today.getDate() - 7);
    // We'll use date range filtering in the filter expression
    return {
      dateRange: {
        start: lastWeekStart.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0]
      }
    };
  }
  
  // Check for specific month
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june', 
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  for (let i = 0; i < monthNames.length; i++) {
    if (query.toLowerCase().includes(monthNames[i])) {
      filters.month = i + 1; // 1-12 for months
      
      // Check if a year is also mentioned
      const yearMatch = query.match(/\b(20\d{2})\b/); // Match years like 2021, 2022, etc.
      if (yearMatch) {
        filters.year = parseInt(yearMatch[1]);
      }
      
      return filters;
    }
  }
  
  // Check for year
  const yearMatch = query.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    filters.year = parseInt(yearMatch[1]);
    return filters;
  }
  
  return null;
}

// Helper function to check for status/environment filters
function extractMetadataFilters(query: string) {
  const filters: Record<string, any> = {};
  
  // Check for environment mentions
  const environments = ['production', 'development', 'staging', 'test'];
  for (const env of environments) {
    if (query.toLowerCase().includes(env)) {
      filters.environment = env;
    }
  }
  
  // Check for status mentions
  const statuses = ['success', 'failed', 'error', 'pending'];
  for (const status of statuses) {
    if (query.toLowerCase().includes(status)) {
      filters.status = status;
    }
  }
  
  // Check for correctness filters
  if (query.toLowerCase().includes('correct')) {
    filters.is_correct = true;
  } else if (query.toLowerCase().includes('incorrect') || query.toLowerCase().includes('wrong')) {
    filters.is_correct = false;
  }
  
  return Object.keys(filters).length > 0 ? filters : null;
}

// Build a filter expression for Pinecone query
function buildFilterExpression(dateFilters: Record<string, any> | null, metadataFilters: Record<string, any> | null) {
  const filters: Record<string, any> = {};
  
  // Add date filters
  if (dateFilters) {
    if (dateFilters.dateRange) {
      // Handle date range queries
      const { start, end } = dateFilters.dateRange;
      filters.date_str = { $gte: start, $lte: end };
    } else {
      // Handle exact date or specific month/year
      Object.assign(filters, dateFilters);
    }
  }
  
  // Add metadata filters
  if (metadataFilters) {
    Object.assign(filters, metadataFilters);
  }
  
  return Object.keys(filters).length > 0 ? filters : null;
}

// Function to test a query
async function testQuery(query: string) {
  console.log(chalk.cyan(`\n-----------------------------------------------------`));
  console.log(chalk.cyan(`Testing query: "${query}"`));
  console.log(chalk.cyan(`-----------------------------------------------------`));
  
  try {
    // Extract date filters
    const dateFilters = extractDateFilters(query);
    if (dateFilters) {
      console.log(chalk.green(`✓ Date filters detected:`), dateFilters);
    } else {
      console.log(chalk.yellow(`✗ No date filters detected`));
    }
    
    // Extract metadata filters
    const metadataFilters = extractMetadataFilters(query);
    if (metadataFilters) {
      console.log(chalk.green(`✓ Metadata filters detected:`), metadataFilters);
    } else {
      console.log(chalk.yellow(`✗ No metadata filters detected`));
    }
    
    // Build filter expression
    const filterExpression = buildFilterExpression(dateFilters, metadataFilters);
    
    // Create embedding
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",  
      input: query
    });
    const embedding = embeddingResponse.data[0].embedding;
    
    // Query Pinecone
    const index = pinecone.Index(process.env.PINECONE_INDEX || 'handit-agent-insights');
    console.log(chalk.blue(`\nQuerying Pinecone index: ${process.env.PINECONE_INDEX || 'handit-agent-insights'}`));
    
    if (filterExpression) {
      console.log(chalk.blue(`With filter:`), filterExpression);
    } else {
      console.log(chalk.blue(`With no filters`));
    }
    
    // Build query options
    const queryOptions: any = {
      vector: embedding,
      topK: 3,
      includeMetadata: true
    };
    
    // Add filter if available
    if (filterExpression) {
      queryOptions.filter = filterExpression;
    }
    
    const queryResponse = await index.query(queryOptions);
    
    // Display results
    console.log(chalk.green(`\n✓ Found ${queryResponse.matches?.length || 0} matches`));
    
    if (queryResponse.matches && queryResponse.matches.length > 0) {
      queryResponse.matches.forEach((match, idx) => {
        console.log(chalk.yellow(`\nMatch #${idx + 1} (Score: ${match.score?.toFixed(2)})`));
        const metadata = match.metadata || {};
        
        // Display type and important metadata
        console.log(chalk.cyan(`Type: ${metadata.type || 'unknown'}`));
        
        if (metadata.date_str) {
          console.log(chalk.cyan(`Date: ${metadata.date_str}`));
        }
        
        if (metadata.environment) {
          console.log(chalk.cyan(`Environment: ${metadata.environment}`));
        }
        
        if (metadata.status) {
          console.log(chalk.cyan(`Status: ${metadata.status}`));
        }
        
        // Display content snippet based on type
        if (metadata.type === 'entry') {
          console.log(chalk.white(`Input: ${(metadata.input as string || '').substring(0, 100)}...`));
          console.log(chalk.white(`Output: ${(metadata.output as string || '').substring(0, 100)}...`));
        } else if (metadata.type === 'insight') {
          console.log(chalk.white(`Problem: ${(metadata.problem as string || '').substring(0, 100)}...`));
          console.log(chalk.white(`Solution: ${(metadata.solution as string || '').substring(0, 100)}...`));
        }
      });
    } else {
      console.log(chalk.red(`No matches found with the current filters`));
    }
    
  } catch (error) {
    console.error(chalk.red('Error during query:'), error);
  }
}

// Sample queries to test
const queries = [
  "Show me agent interactions from yesterday",
  "What were the common failures last month?",
  "How did the agent perform in the production environment?",
  "Give me insights from completed tasks in March 2023",
  "What were the most common errors in the production environment last week?",
  "Show me all correct responses from 2023-05-15",
  "What were the issues in development environment in January?",
  "Show me pending tasks with errors"
];

// Run the test script
async function main() {
  console.log(chalk.green.bold('Testing Date and Metadata Filtering'));
  console.log(chalk.white('This script helps verify that date and metadata filtering work correctly'));
  
  // Check environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error(chalk.red.bold('Error: OPENAI_API_KEY not found in environment variables'));
    process.exit(1);
  }
  
  if (!process.env.PINECONE_API_KEY) {
    console.error(chalk.red.bold('Error: PINECONE_API_KEY not found in environment variables'));
    process.exit(1);
  }
  
  if (!process.env.PINECONE_INDEX) {
    console.warn(chalk.yellow.bold('Warning: PINECONE_INDEX not found in environment variables, using default "handit-agent-insights"'));
  }
  
  // Test each query
  for (const query of queries) {
    await testQuery(query);
  }
  
  console.log(chalk.green.bold('\nAll tests completed!'));
}

// Run the main function
main().catch(console.error); 