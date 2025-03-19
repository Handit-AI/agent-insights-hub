# HandIt Agent Chat

A Motia-based agent that provides insights about other agents using RAG (Retrieval Augmented Generation).

## Overview

This agent serves as a meta-assistant that helps users understand and gain insights about other AI agents. It uses:

- **Pinecone Vector Database** for storing and retrieving agent data, entries, and insights
- **OpenAI** for generating contextually relevant responses
- **RAG Pattern** to provide accurate information based on real agent performance data

## Features

- **Interactive Chat Interface**: Users can ask questions about agent performance
- **Performance Analysis**: Get insights on why agents succeed or fail
- **Improvement Suggestions**: Receive data-backed suggestions to improve agent performance
- **Knowledge Base Access**: Query historical entries, inputs, outputs, and evaluations
- **Contextual Understanding**: The agent understands the context of your questions
- **Powerful Chat Interface**: Interact with your agent data through natural language
- **Pinecone Vector Database**: Efficient storage and retrieval of agent interactions
- **OpenAI Integration**: Generate insights using advanced language models
- **LLM-powered Filter Extraction**: Natural language understanding of date and metadata filters
- **Date and Metadata Filtering**: Query for specific time periods like "yesterday" or filter by environments
- **Detailed Analytics**: Get insights about agent performance across various dimensions
- **Handit Tracing**: Comprehensive tracing and monitoring of AI operations

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Set up your environment variables:
   ```
   cp .env.example .env
   # Edit the .env file with your actual API keys
   ```

## Data Setup

Before using the agent, you need to upload your data to Pinecone:

1. Go to the scripts directory:
   ```
   cd scripts
   ```

2. Install script dependencies:
   ```
   npm install
   ```

3. Configure script environment:
   ```
   cp .env.example .env
   # Edit the .env file with your API keys and CSV paths
   ```

4. Verify your environment and connections:
   ```
   npm run verify
   ```
   
   This will check that your API keys, connections, and index are properly set up.

5. Run the data upload script:
   ```
   npm start
   ```
   
   If you encounter TypeScript errors:
   ```
   npm run start:ignore-types
   ```

For more details on data upload, see the [Script README](./scripts/README.md).

## Architecture

The agent follows an event-driven architecture with the following steps:

1. **Message API**: Receives user queries via a REST API
2. **Preprocess Message**: Optional preprocessing of user messages (traced with Handit)
3. **LLM Filter Extraction**: Uses AI to extract date and metadata filters from natural language (traced with Handit)
4. **Pinecone RAG Retrieval**: Queries Pinecone for relevant context using extracted filters (traced with Handit)
5. **OpenAI Generation**: Uses retrieved context and OpenAI to generate friendly, accessible responses (traced with Handit)
6. **Response Handler**: Handles the final response, stores conversation history

## AI Monitoring with Handit

This agent integrates with [Handit](https://handit.ai/) for comprehensive monitoring and tracing of AI operations. Handit provides:

- End-to-end tracing of AI agent workflows
- Performance monitoring for each processing step
- Visualization of trace data and performance metrics
- Debug insights for identifying bottlenecks and errors

### Traced Components

The following components are traced with Handit:

- **Preprocessing**: Message preparation (ID: `metaAgentK40-toolpreprocessp6`)
- **Filter Extraction**: LLM-based extraction of date and metadata filters (ID: `metaAgentK40-llmFiltersrv`)
- **RAG Retrieval**: Vector search in Pinecone (ID: `metaAgentK40-toolragRetrievvz`)
- **Response Generation**: OpenAI-based response generation (ID: `metaAgentK40-responseGecp`)

### Example Traces

To see an example of how a complete workflow is traced with Handit, check the example in `examples/traced-agent.ts`.

### Configuring Handit

The Handit configuration is stored in `utils/handit-tracing.ts`. You can adjust the tracing IDs and behavior by modifying this file.

## Handit Tracing with Motia Flow ID

The agent now integrates Handit tracing with Motia's flow ID to enable comprehensive monitoring and visualization of the entire conversation flow. This integration ensures that all traced operations are properly associated with a specific flow, enabling Handit to understand the relationships between different operations and visualize the complete workflow.

### How It Works

1. **Flow ID Generation**: When a new conversation starts, a unique flow ID is generated in the preprocess-message step. This ID is then passed through all subsequent steps as `_handidFlowId`.

2. **Tracing with Flow ID**: Each operation is traced using the `traceWithHandit` function, which accepts the agent node ID, the flow ID, and the callback function to be traced. The flow ID is passed as the `externalId` parameter to the Handit SDK.

3. **End of Flow Tracing**: At the end of the flow, the `flow-completion.step.ts` calls `endAgentTracing` with the flow ID to properly close the tracing session.

### Tracing Flow

The tracing flow follows this sequence:

1. **Preprocess Message**: Generates a flow ID and starts tracing
2. **Filter Extraction**: Continues tracing using the flow ID
3. **Pinecone Retrieval**: Traces context retrieval with the flow ID
4. **OpenAI Generation**: Traces response generation with the flow ID
5. **Flow Completion**: Ends the tracing session using the flow ID

### Extending Tracing

To add tracing to a new operation:

1. Import the necessary functions:
```typescript
import { agentsTrackingConfig, traceWithHandit } from '../utils/handit-tracing'
```

2. Extract the flow ID from the input:
```typescript
const flowId = input._handidFlowId
```

3. Wrap your function with the tracing function:
```typescript
const tracedFunction = traceWithHandit(
  agentsTrackingConfig.yourAgentNodeId,
  flowId,
  yourFunction
)

// Then call the traced function
const result = await tracedFunction(...args)
```

4. Pass the flow ID to the next step:
```typescript
await emit({
  topic: 'next-step',
  data: {
    // Your data
    _handidFlowId: flowId, // Pass the flow ID
  },
})
```

### Viewing Traces

After running the agent, you can view the traces in the Handit dashboard. The traces will be grouped by flow ID, allowing you to see the complete flow of operations for each conversation.

## Usage

To start the agent:

```