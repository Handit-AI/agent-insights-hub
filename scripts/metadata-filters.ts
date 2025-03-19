/**
 * This file contains the reference implementation of date and metadata filter extraction logic
 * that was previously used in the Pinecone retrieval step.
 * 
 * It's kept as a reference for the new LLM-based filter extraction approach.
 */

// Helper function to extract date patterns from query
export function extractDateFilters(query: string) {
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
export function extractMetadataFilters(query: string) {
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
export function buildFilterExpression(dateFilters: Record<string, any> | null, metadataFilters: Record<string, any> | null) {
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