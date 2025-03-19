import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import fs from 'fs';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

async function verifySetup() {
  console.log('=== HANDIT AGENT SETUP VERIFICATION ===');
  console.log('Checking environment variables and connections...\n');

  // Check OpenAI API key
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error('❌ OpenAI API key not found in environment variables');
  } else {
    console.log('✅ OpenAI API key found');
    
    // Test OpenAI connection
    try {
      const openai = new OpenAI({
        apiKey: openaiApiKey,
      });
      
      console.log('   Testing OpenAI connection...');
      const modelList = await openai.models.list();
      console.log(`✅ OpenAI connection successful (${modelList.data.length} models available)`);
    } catch (error) {
      console.error('❌ OpenAI connection failed:', error);
    }
  }

  console.log('');

  // Check Pinecone API key
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  if (!pineconeApiKey) {
    console.error('❌ Pinecone API key not found in environment variables');
  } else {
    console.log('✅ Pinecone API key found');
    
    // Check Pinecone index name
    const pineconeIndex = process.env.PINECONE_INDEX || 'handit-agent-insights';
    console.log(`ℹ️ Using Pinecone index: ${pineconeIndex}`);
    
    // Test Pinecone connection
    try {
      const pinecone = new Pinecone({
        apiKey: pineconeApiKey,
      });
      
      console.log('   Testing Pinecone connection...');
      const indexes = await pinecone.listIndexes();
      console.log('✅ Pinecone connection successful');
      
      // Check if our index exists
      const indexNames = indexes.indexes?.map(index => index.name) || [];
      
      if (indexNames.includes(pineconeIndex)) {
        console.log(`✅ Index '${pineconeIndex}' exists`);
        
        // Check index stats
        try {
          const index = pinecone.Index(pineconeIndex);
          const stats = await index.describeIndexStats();
          console.log(`✅ Index stats retrieved. Total vectors: ${stats.totalRecordCount}`);
          
          if (stats.totalRecordCount === 0) {
            console.warn('⚠️ Your index is empty. Run the data upload script first');
          } else {
            console.log(`ℹ️ Namespaces: ${Object.keys(stats.namespaces || {}).join(', ') || 'default'}`);
          }
        } catch (error) {
          console.error(`❌ Error retrieving index stats:`, error);
        }
      } else {
        console.error(`❌ Index '${pineconeIndex}' does not exist. Available indexes: ${indexNames.join(', ') || 'none'}`);
      }
    } catch (error) {
      console.error('❌ Pinecone connection failed:', error);
    }
  }
  
  console.log('\n=== VERIFICATION COMPLETE ===');
}

verifySetup().catch(error => {
  console.error('Verification script failed:', error);
  process.exit(1);
}); 