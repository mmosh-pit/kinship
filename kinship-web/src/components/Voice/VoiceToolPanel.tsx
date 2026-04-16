import { useEffect, useState } from "react";

const informationSearchFunctionDescription = `
Use this function when a user asks for information about any topic. This includes queries such as:
- General knowledge questions
- Specific topic research
- Information requests about concepts, places, people, or things
- When users want to know about something or need explanation
- Any informational query that requires searching knowledge base

This tool searches a comprehensive knowledge base for relevant information. Always use this tool when a user asks for information, explanations, or knowledge about any topic.
`;

const sessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "search_information",
        description: informationSearchFunctionDescription,
        parameters: {
          type: "object",
          strict: true,
          properties: {
            query: {
              type: "string",
              description: "The user's question or search query for information. Examples: 'What is artificial intelligence?', 'Tell me about climate change', 'How does machine learning work?', 'Information about renewable energy'.",
            },
          },
          required: ["query"],
        },
      },
    ],
    tool_choice: "auto",
    instructions: `
      Follow these guidelines for tool selection:
      
      1. INFORMATION SEARCH TOOL:
         - USE WHEN: User asks for information, knowledge, explanations, or wants to learn about any topic
         - EXAMPLES: "What is...", "Tell me about...", "How does... work?", "Explain...", "Information about..."
         
      2. NO TOOL NEEDED:
         - If the query is a simple greeting, thank you, or doesn't require searching information
         - For casual conversation or clarification questions that don't need knowledge base search
         
      Always provide natural, conversational responses and maintain context between interactions.
    `
  },
};

function InformationFunctionCallOutput({ functionCallOutput, searchResults }: { functionCallOutput: any, searchResults: any }) {
  let query = "Unknown query";
  
  console.log("Function call output for display:", functionCallOutput);
  console.log("Arguments:", functionCallOutput.arguments);
  console.log("Arguments type:", typeof functionCallOutput.arguments);
  
  try {
    if (functionCallOutput.arguments) {
      const argsString = typeof functionCallOutput.arguments === 'string' 
        ? functionCallOutput.arguments 
        : JSON.stringify(functionCallOutput.arguments);
      
      console.log("Parsing arguments string:", argsString);
      
      if (argsString && argsString.trim()) {
        const args = JSON.parse(argsString);
        query = args.query || "No query found in args";
        console.log("Extracted query:", query);
      }
    }
  } catch (error) {
    console.error("Error parsing function call arguments:", error);
    console.error("Raw arguments:", functionCallOutput.arguments);
    
    // Try to extract query from raw string if JSON parsing fails
    if (typeof functionCallOutput.arguments === 'string') {
      const match = functionCallOutput.arguments.match(/"query":\s*"([^"]+)"/);
      if (match) {
        query = match[1];
        console.log("Extracted query from regex:", query);
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">Search Query: {query}</p>
      <div className="text-xs bg-yellow-100 p-2 rounded">
        <strong>Debug Info:</strong>
        <br />Arguments Type: {typeof functionCallOutput.arguments}
        <br />Arguments: {JSON.stringify(functionCallOutput.arguments, null, 2)}
        <br />Extracted Query: {query}
      </div>
      {searchResults ? (
        <div className="space-y-2">
          <p className="text-sm text-green-600">{searchResults.message}</p>
          {searchResults.results && searchResults.results.length > 0 ? (
            <div className="space-y-2">
              {searchResults.results.map((result: any, index: number) => (
                <div key={result.id || index} className="bg-white p-3 rounded border">
                  <p className="text-xs text-gray-500 mb-1">Score: {result.score?.toFixed(4)}</p>
                  {result.metadata && (
                    <div className="text-sm">
                      {Object.entries(result.metadata).map(([key, value]) => (
                        <div key={key} className="mb-1">
                          <span className="font-medium">{key}:</span> {String(value)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No results found</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-blue-500">Searching...</p>
      )}
      <pre className="text-xs bg-gray-100 rounded-md p-2 overflow-x-auto">
        {JSON.stringify(functionCallOutput, null, 2)}
      </pre>
    </div>
  );
}

interface VoiceToolPanelProps {
  isSessionActive: boolean;
  sendClientEvent: (message: any) => void;
  events: any[];
}

export default function VoiceToolPanel({
  isSessionActive,
  sendClientEvent,
  events,
}: VoiceToolPanelProps) {
  const [informationSearchResults, setInformationSearchResults] = useState<{ [key: string]: any }>({});
  const [functionAdded, setFunctionAdded] = useState(false);
  const [processedCalls, setProcessedCalls] = useState(new Set<string>());
  const [completedFunctionCalls, setCompletedFunctionCalls] = useState<{ [key: string]: any }>({});

  const handleInformationSearch = async (query: string, callId: string) => {
    console.log("🚀 STARTING INFORMATION SEARCH");
    console.log("📤 Query being sent to API:", query);
    console.log("🆔 Call ID:", callId);
    
    try {
      setInformationSearchResults(prev => ({
        ...prev,
        [callId]: { loading: true }
      }));

      const requestBody = { query };
      console.log("📦 Request body:", requestBody);

      const response = await fetch('/api/search-information', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Information search response:', data);
      console.log('📊 Number of results:', data.results?.length || 0);

      setInformationSearchResults(prev => ({
        ...prev,
        [callId]: data
      }));

      // Send the function call output back to the session
      setTimeout(() => {
        const output = {
          success: true,
          message: data.message,
          results: data.results,
          searchQuery: query,
          detailedInfo: data.results.map((result: any) => ({
            score: result.score,
            content: result.metadata
          }))
        };
        
        console.log("📨 Sending function call output:", output);
        
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(output),
          },
        });
        sendClientEvent({
          type: "response.create",
          response: {
            instructions: `
              Based on the search results provided, give a comprehensive answer about the topic. 
              Use the specific information found in the search results to provide detailed, accurate information.
              Be conversational and helpful in your response.
            `,
          },
        });
      }, 500);

    } catch (error) {
      console.error('❌ Information search error:', error);
      
      const errorMessage = {
        error: "Failed to search information",
        details: error instanceof Error ? error.message : "Unknown error"
      };

      setInformationSearchResults(prev => ({
        ...prev,
        [callId]: errorMessage
      }));

      setTimeout(() => {
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({
              success: false,
              error: 'Failed to search for information',
              message: 'There was an error accessing the knowledge base'
            }),
          },
        });
        sendClientEvent({
          type: "response.create",
          response: {
            instructions: `
              Apologize for the technical issue and let the user know that the information search 
              is temporarily unavailable. Suggest they try again later.
            `,
          },
        });
      }, 500);
    }
  };

  const processFunctionCall = (functionCall: any, source: string) => {
    console.log(`Processing function call from ${source}:`, functionCall);
    console.log("Function call arguments:", functionCall.arguments);
    console.log("Arguments type:", typeof functionCall.arguments);
    
    // Store the completed function call for display
    setCompletedFunctionCalls(prev => ({
      ...prev,
      [functionCall.call_id]: functionCall
    }));
    
    // Prevent duplicate processing
    const callKey = `${functionCall.call_id}_${functionCall.name}`;
    if (processedCalls.has(callKey)) {
      console.log("Function call already processed, skipping:", callKey);
      return;
    }
    
    // Mark as processed
    setProcessedCalls(prev => new Set([...prev, callKey]));
    
    if (functionCall.name === "search_information") {
      try {
        let query = "";
        
        if (functionCall.arguments) {
          const argsString = typeof functionCall.arguments === 'string' 
            ? functionCall.arguments 
            : JSON.stringify(functionCall.arguments);
          
          console.log("Processing arguments string:", argsString);
          
          if (argsString && argsString.trim()) {
            const args = JSON.parse(argsString);
            query = args.query || "";
            console.log("🔍 QUERY BEING SENT TO VECTOR DB:", query);
            
            if (query) {
              handleInformationSearch(query, functionCall.call_id);
            } else {
              console.error("No query found in parsed arguments:", args);
            }
          } else {
            console.error("Arguments string is empty or whitespace");
          }
        } else {
          console.error("No arguments provided for search_information function");
        }
      } catch (error) {
        console.error("Error parsing function call arguments:", error);
        console.error("Raw arguments:", functionCall.arguments);
        
        // Try to extract query from raw string if JSON parsing fails
        if (typeof functionCall.arguments === 'string') {
          const match = functionCall.arguments.match(/"query":\s*"([^"]+)"/);
          if (match) {
            const extractedQuery = match[1];
            console.log("🔍 QUERY EXTRACTED WITH REGEX FOR VECTOR DB:", extractedQuery);
            handleInformationSearch(extractedQuery, functionCall.call_id);
          }
        }
      }
    }
  };

  useEffect(() => {
    if (!events || events.length === 0) return;

    // Debug: Log all events to see the full conversation flow
    console.log("All recent events:", events.slice(0, 3));

    const firstEvent = events[events.length - 1];
    if (!functionAdded && firstEvent.type === "session.created") {
      sendClientEvent(sessionUpdate);
      setFunctionAdded(true);
      console.log("Tools registered with session");
    }

    const mostRecentEvent = events[0];
    console.log("Most recent event:", mostRecentEvent.type, mostRecentEvent);
    
    // Check for any function call events
    if (mostRecentEvent.type === "response.function_call_arguments.delta" || 
        mostRecentEvent.type === "response.function_call_arguments.done") {
      console.log("Function call event detected:", mostRecentEvent);
    }

    // Handle function call completion
    if (mostRecentEvent.type === "response.function_call_arguments.done") {
      console.log("Function call completed:", mostRecentEvent);
      const functionCall = {
        type: "function_call",
        name: mostRecentEvent.name,
        call_id: mostRecentEvent.call_id,
        arguments: mostRecentEvent.arguments
      };
      
      processFunctionCall(functionCall, "response.function_call_arguments.done");
    }

    // Handle output item completion (alternative function call completion path)
    if (mostRecentEvent.type === "response.output_item.done" && mostRecentEvent.item) {
      console.log("Output item completed:", mostRecentEvent);
      if (mostRecentEvent.item.type === "function_call") {
        const functionCall = mostRecentEvent.item;
        console.log("Function call from output item:", functionCall);
        
        processFunctionCall(functionCall, "response.output_item.done");
      }
    }
    
    if (
      mostRecentEvent.type === "response.done" &&
      mostRecentEvent.response.output
    ) {
      console.log("Response output:", mostRecentEvent.response.output);
      mostRecentEvent.response.output.forEach((output: any) => {
        console.log("Processing output:", output.type, output.name);
        if (output.type === "function_call") {
          processFunctionCall(output, "response.done");
        }
      });
    }
  }, [events]);

  useEffect(() => {
    if (!isSessionActive) {
      setFunctionAdded(false);
      setInformationSearchResults({});
      setProcessedCalls(new Set());
      setCompletedFunctionCalls({});
    }
  }, [isSessionActive]);

  const functionCallEvents = events.filter(event => 
    event.type === "conversation.item.created" && 
    event.item?.type === "function_call"
  );

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">🔍 Information Search Tool</h3>
          <p className="text-xs text-gray-600">
            Searches comprehensive knowledge base for information on any topic. Simply ask questions or request information to activate this tool.
          </p>
        </div>
      </div>

      {functionCallEvents.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            Function Calls
          </h3>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {functionCallEvents.map((event, index) => {
              const item = event.item;
              const callId = item.call_id;
              const searchResults = informationSearchResults[callId];
              
              // Use completed function call if available, otherwise use the initial one
              const displayItem = completedFunctionCalls[callId] || item;

              return (
                <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-900">
                      {displayItem.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(event.item.created_at * 1000).toLocaleTimeString()}
                    </span>
                  </div>

                  {displayItem.name === "search_information" && (
                    <InformationFunctionCallOutput 
                      functionCallOutput={displayItem}
                      searchResults={searchResults}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {functionCallEvents.length === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-gray-500 text-sm">
            Ask any question to start using the information search tool
          </p>
        </div>
      )}

      {/* Status display */}
      <div className="bg-gray-100 rounded-md p-2 text-xs">
        <p>Session active: {isSessionActive ? "Yes" : "No"}</p>
        <p>Tools registered: {functionAdded ? "Yes" : "No"}</p>
        <p>Active function calls: {Object.keys(informationSearchResults).length}</p>
        <p>Completed function calls: {Object.keys(completedFunctionCalls).length}</p>
      </div>
    </div>
  );
} 