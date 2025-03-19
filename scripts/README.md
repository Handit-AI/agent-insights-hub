# HandIt Agent Data Upload Script

This script processes CSV data from HandIt agent entries and insights, and uploads them to Pinecone for vector search retrieval.

## Prerequisites

- Node.js v18+ installed
- Pinecone account with API key
- OpenAI API key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with the following variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX=handit-agent-insights
   ENTRIES_CSV_PATH=../data/file_classifier_entries.csv
   INSIGHTS_CSV_PATH=../data/insights.csv
   ```

3. Create a data directory and place your CSV files:
   ```bash
   mkdir -p ../data
   # Place your CSV files in the data directory
   ```

## Verifying Your Setup

Before running the data upload, you can verify your connections and environment setup:

```bash
npm run verify
```

The verification script will:
1. Check that your API keys are properly set
2. Test the connection to OpenAI
3. Test the connection to Pinecone
4. Verify if your index exists
5. Show statistics about your index if it exists

If you encounter TypeScript errors:
```bash
npm run verify:ignore-types
```

## CSV File Format

### Entries CSV (Required)
The entries CSV should have the following columns:
- id
- input (JSON with message objects)
- output
- is_correct
- created_at
- model_id
- (other optional fields)

### Insights CSV (Optional)
The insights CSV should have the following columns:
- problem
- solution
- (other optional fields)

## Running the Script

Run the script with:

```bash
npm start
```

The script will:
1. Connect to Pinecone and create an index if it doesn't exist
2. Read and process the entries CSV
3. Filter and extract message content based on requirements
4. Create embeddings for the processed messages
5. Upload vectors to Pinecone in batches
6. Process and upload insight vectors to Pinecone (if insights CSV exists)

## Troubleshooting

### API Key Issues
- Verify your API keys in the .env file
- Check if your Pinecone API key has the correct permissions

### CSV Format Issues
- Make sure your CSV files match the expected format
- Ensure the input column contains valid JSON data
- Verify that messages have the proper structure

### TypeScript Errors
- If you encounter type errors with Pinecone metadata, ensure you're using the latest version of the Pinecone SDK
- We use `as any` type casting in some places to work around Pinecone SDK type limitations
- Run with `ts-node --transpile-only` to ignore type errors if needed

### Index Creation Issues
- If the index creation fails, try creating it manually in the Pinecone dashboard
- Verify that you have enough quota in your Pinecone account
- Check the cloud and region settings match your Pinecone account

### File Access Issues
- The script expects the CSV files to be in the specified locations
- Make sure the files are readable by the current user
- If the insights CSV is missing, the script will skip that part and continue

## How It Works

1. **Data Processing**:
   - Parses the CSV files
   - Processes JSON message objects
   - Filters out messages with type=image_url
   - For user messages, extracts content and filters out file types

2. **Vector Creation**:
   - Uses OpenAI's text-embedding-ada-002 model to generate embeddings
   - Formats metadata for Pinecone compatibility
   - Serializes complex objects as JSON strings to avoid type issues

3. **Pinecone Upload**:
   - Batches vectors for efficient uploading
   - Stores entries and insights with appropriate metadata
   - Uses proper error handling to continue even if parts fail 