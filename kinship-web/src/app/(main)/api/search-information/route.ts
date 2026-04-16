import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || "c8a7c164-967c-4f62-97c3-20a8753c9586",
});

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GENAI_API_KEY || "AIzaSyAai2W4h20qe5j_LFvtc24pCTTU6Dc7dlo");

const indexName = process.env.PINECONE_INDEX || "mmosh-index";

export async function POST(request: NextRequest) {
  console.log("Search information from PUBLIC namespace");
  try {
    const { query } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Get the index
    const index = pinecone.Index(indexName);

    // Create embedding using Google's model
    const model = genAI.getGenerativeModel({ model: "models/embedding-001" });
    const result = await model.embedContent(query);
    const queryEmbedding = result.embedding.values;

    // Search in the PUBLIC namespace
    const searchResponse = await index.namespace("PUBLIC").query({
      vector: queryEmbedding,
      topK: 5,
      includeMetadata: true,
      includeValues: false,
    });

    // Format the results
    const results = searchResponse.matches.map(match => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata,
    }));
    console.log(results);

    return NextResponse.json({
      query,
      results,
      message: `Found ${results.length} relevant information results`,
      model: "models/embedding-001"
    });

  } catch (error) {
    console.error('Pinecone search error:', error);
    return NextResponse.json({ 
      error: 'Failed to search information', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 