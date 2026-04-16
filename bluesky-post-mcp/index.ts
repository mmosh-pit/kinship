import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { connectToDatabase, pgPool, connectToPostgres } from "./config/dbClient";
import { config } from "./config/config";
import { client } from "./services/httpClient";
import { decryptCredentials } from "./utils/encryption";

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// Transport management
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Create MCP server
const server = new McpServer({
  name: "CAT-FAWN Bluesky Bot",
  version: "1.0.0"
});

let db: any = null;

// Connect to databases
connectToDatabase()
  .then((database) => {
    db = database;
    console.log("MongoDB connected successfully");

    // Also connect to PostgreSQL for tool_connections
    return connectToPostgres();
  })
  .then(() => {
    console.log("PostgreSQL connected successfully");

    app.listen(config.port, () => {
      console.log(`Bluesky Bot running on port ${config.port}`);
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
  });

// Helper function to format responses
const getResponse = (message: string) => {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
        _meta: {},
      },
    ],
  };
}

// Get users with Bluesky accounts from Kinship Bots database
async function getUsersWithBluesky() {
  try {
    const collection = db.collection("mmosh-users");
    const users = await collection.find({
      "bluesky.handle": { $exists: true, $nin: [null, ""] }
    }).toArray();

    // Filter out potential spam accounts
    const validUsers = users.filter((user: any) => {
      const handle = user.bluesky.handle;

      // Skip if handle is invalid
      if (!handle || typeof handle !== 'string') return false;

      // Filter out obvious spam patterns
      const spamPatterns = [
        /^\d+$/,                    // Only numbers
        /^[a-z]{1,3}$/i,            // Very short handles (1-3 chars)
        /^(test|spam|bot|fake)/i,   // Common spam prefixes
        /(porn|xxx|sex|casino)/i,   // Adult/gambling content
        /^(.)\1{4,}/,               // Repeated characters (aaaaa)
      ];

      if (spamPatterns.some(pattern => pattern.test(handle))) {
        return false;
      }

      // Must have proper format (alphanumeric + dots/hyphens)
      if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(handle)) {
        return false;
      }

      return true;
    });

    return validUsers.map((user: any) => ({
      blueskyHandle: user.bluesky.handle,
    }));
  } catch (error) {
    console.error("Error fetching Bluesky users:", error);
    return [];
  }
}

// Get agent Bluesky credentials from PostgreSQL tool_connections table
async function getBlueskyCredentials(agentId: string) {
  try {
    // Query PostgreSQL tool_connections table
    const result = await pgPool.query(
      `SELECT credentials_encrypted FROM tool_connections WHERE worker_id = $1 LIMIT 1`,
      [agentId]
    );

    if (result.rows.length === 0) {
      return {
        status: false,
        message: "Bluesky is not connected in the bot.",
        result: null
      }
    }

    // Decrypt the credentials
    const encryptedCredentials = result.rows[0].credentials_encrypted;
    const allCredentials = decryptCredentials<{
      bluesky?: { handle: string; app_password: string };
      [key: string]: any;
    }>(encryptedCredentials);

    // Check if bluesky credentials exist
    if (!allCredentials.bluesky) {
      return {
        status: false,
        message: "Bluesky is not connected in the bot.",
        result: null
      }
    }

    const blueskyCredentials = allCredentials.bluesky;

    // Validate required fields
    if (!blueskyCredentials.handle || !blueskyCredentials.app_password) {
      return {
        status: false,
        message: "Invalid Bluesky credentials stored.",
        result: null
      }
    }

    return {
      status: true,
      result: {
        handle: blueskyCredentials.handle,
        password: blueskyCredentials.app_password
      }
    }
  } catch (error) {
    console.error("Error fetching Bluesky credentials:", error);
    return {
      status: false,
      message: "Didn't retrieve the Blue Sky account",
      result: null
    }
  }
}

// Format mentions for Bluesky post
function formatMentionsInText(text: string, users: any[]) {
  if (users.length === 0) return text;

  // Add mentions at the end of the text
  const mentions = users.map(u => `@${u.blueskyHandle}`).join(" ");
  return `${text}\n\n${mentions}`;
}

// Create facets for mentions (required by Bluesky API)
function createMentionFacets(text: string, users: any[]) {
  const facets: any[] = [];

  users.forEach(user => {
    const mention = `@${user.blueskyHandle}`;
    const startIndex = text.indexOf(mention);

    if (startIndex !== -1) {
      // Calculate byte positions (Bluesky uses UTF-8 byte indices)
      const byteStart = Buffer.from(text.substring(0, startIndex)).length;
      const byteEnd = byteStart + Buffer.from(mention).length;

      facets.push({
        index: {
          byteStart,
          byteEnd
        },
        features: [{
          $type: "app.bsky.richtext.facet#mention",
          did: user.did || `@${user.blueskyHandle}` // Will need to resolve DID
        }]
      });
    }
  });

  return facets;
}

// Authenticate with Bluesky
async function authenticateBluesky(identifier: string, password: string) {
  try {
    const response = await axios.post(
      `${config.blueSkyBaseRpcUrl}/com.atproto.server.createSession`,
      { identifier, password },
      { headers: { "Content-Type": "application/json" } }
    );

    return {
      did: response.data.did,
      accessJwt: response.data.accessJwt,
      refreshJwt: response.data.refreshJwt,
    };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    throw new Error(`Bluesky authentication error: ${errorMsg}`);
  }
}

// Resolve Bluesky handle to DID
async function resolveHandle(handle: string): Promise<string | null> {
  try {
    const response = await axios.get(
      `${config.blueSkyBaseRpcUrl}/com.atproto.identity.resolveHandle`,
      { params: { handle } }
    );

    return response.data.did;
  } catch (error: any) {
    // Log a concise error message instead of full stack trace
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
    console.warn(`⚠️ Could not resolve handle @${handle}: ${errorMessage}`);
    return null;
  }
}

// Helper function to split text by byte length safely
function splitTextByBytes(text: string, maxBytes: number): string[] {
  const parts: string[] = [];
  let currentPart = '';
  let currentBytes = 0;

  // Split by words to avoid breaking mid-word
  const words = text.split(/(\s+)/); // Keep whitespace

  for (const word of words) {
    const wordBytes = Buffer.from(word).length;

    if (currentBytes + wordBytes <= maxBytes) {
      currentPart += word;
      currentBytes += wordBytes;
    } else {
      if (currentPart.trim()) {
        parts.push(currentPart.trim());
      }
      currentPart = word;
      currentBytes = wordBytes;

      // If single word exceeds limit, split it character by character
      if (wordBytes > maxBytes) {
        currentPart = '';
        currentBytes = 0;
        for (const char of word) {
          const charBytes = Buffer.from(char).length;
          if (currentBytes + charBytes <= maxBytes) {
            currentPart += char;
            currentBytes += charBytes;
          } else {
            if (currentPart) {
              parts.push(currentPart);
            }
            currentPart = char;
            currentBytes = charBytes;
          }
        }
      }
    }
  }

  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }

  return parts;
}

// Helper function to get facets for a specific text segment
function getFacetsForSegment(
  segmentText: string,
  originalText: string,
  allFacets: any[],
  segmentStartByte: number
): any[] {
  const segmentEndByte = segmentStartByte + Buffer.from(segmentText).length;

  return allFacets
    .filter(f => {
      // Check if facet falls within this segment
      return f.index.byteStart >= segmentStartByte && f.index.byteEnd <= segmentEndByte;
    })
    .map(f => ({
      ...f,
      index: {
        byteStart: f.index.byteStart - segmentStartByte,
        byteEnd: f.index.byteEnd - segmentStartByte
      }
    }));
}

// Create a post on Bluesky with mentions
async function createPostWithMentions(
  didResponse: any,
  resource: string,
  text: string,
  tagUsers: boolean = false
): Promise<{ postData: any; tagResults: { tagged: string[]; failed: string[] } }> {
  let finalText = text;
  let facets: any[] = [];
  let tagResults = { tagged: [] as string[], failed: [] as string[] };

  // Get users to tag if requested
  if (tagUsers) {
    const users = await getUsersWithBluesky();

    if (users.length > 0) {
      console.log(`📋 Found ${users.length} users with Bluesky handles to tag`);
      
      // Resolve DIDs for all users (parallel with individual error handling)
      const usersWithDid = await Promise.all(
        users.map(async (user: any) => {
          const did = await resolveHandle(user.blueskyHandle);
          return {
            ...user,
            did
          };
        })
      );

      // Separate resolved and failed handles
      const validUsers = usersWithDid.filter(u => u.did);
      const failedUsers = usersWithDid.filter(u => !u.did);

      // Track results for response
      tagResults.tagged = validUsers.map(u => u.blueskyHandle);
      tagResults.failed = failedUsers.map(u => u.blueskyHandle);

      if (failedUsers.length > 0) {
        console.log(`⚠️ Could not resolve ${failedUsers.length} handle(s): ${failedUsers.map(u => `@${u.blueskyHandle}`).join(', ')}`);
      }

      if (validUsers.length > 0) {
        console.log(`✅ Successfully resolved ${validUsers.length} handle(s): ${validUsers.map(u => `@${u.blueskyHandle}`).join(', ')}`);
        finalText = formatMentionsInText(text, validUsers);
        facets = createMentionFacets(finalText, validUsers);
      } else {
        console.log(`ℹ️ No valid handles to tag, proceeding with post without mentions`);
      }
    } else {
      console.log(`ℹ️ No users with Bluesky handles found in database`);
    }
  }

  const finalTextBytes = Buffer.from(finalText).length;
  const totalPosts = finalTextBytes > 300 ? Math.ceil(finalTextBytes / 285) : 1;

  if (finalTextBytes <= 300) {
    // Simple post
    const record: any = {
      createdAt: new Date().toISOString(),
      $type: resource,
      text: finalText,
    };

    if (facets.length > 0) {
      record.facets = facets;
    }

    const body = {
      collection: resource,
      repo: didResponse.did,
      record,
    };

    const response = await axios.post(
      `${config.blueSkyBaseRpcUrl}/com.atproto.repo.createRecord`,
      body,
      {
        headers: {
          "Authorization": `Bearer ${didResponse.accessJwt}`,
          "Content-Type": "application/json",
        },
      }
    );

    return { postData: response.data, tagResults };
  } else {
    // Thread post
    const postData = await createPostThread(didResponse, resource, finalText, totalPosts, facets);
    return { postData, tagResults };
  }
}

// Create post thread for long texts with proper chaining
async function createPostThread(
  didResponse: any,
  resource: string,
  text: string,
  totalPosts: number,
  facets: any[] = []
) {
  const threadMarker = `🧵1 of ${totalPosts}. `;
  const maxBytesFirstPost = 285 - Buffer.from(threadMarker).length;

  // Split text into parts that fit within byte limits
  const textParts = splitTextByBytes(text, maxBytesFirstPost);

  // Recalculate total posts based on actual splits
  const actualTotalPosts = textParts.length;

  // Get first part and remaining text
  const firstPartText = textParts[0] || '';
  const firstPostText = `🧵1 of ${actualTotalPosts}. ` + firstPartText;

  // Get facets for first post
  const firstPostFacets = getFacetsForSegment(
    firstPartText,
    text,
    facets,
    0
  ).map(f => ({
    ...f,
    index: {
      byteStart: f.index.byteStart + Buffer.from(`🧵1 of ${actualTotalPosts}. `).length,
      byteEnd: f.index.byteEnd + Buffer.from(`🧵1 of ${actualTotalPosts}. `).length
    }
  }));

  const record: any = {
    createdAt: new Date().toISOString(),
    $type: resource,
    text: firstPostText,
  };

  if (firstPostFacets.length > 0) {
    record.facets = firstPostFacets;
  }

  const body = {
    collection: resource,
    repo: didResponse.did,
    record,
  };

  console.log("Creating root post:", firstPostText.substring(0, 50) + "...");

  const response = await axios.post(
    `${config.blueSkyBaseRpcUrl}/com.atproto.repo.createRecord`,
    body,
    {
      headers: {
        "Authorization": `Bearer ${didResponse.accessJwt}`,
        "Content-Type": "application/json",
      },
    }
  );

  const rootData = response.data;
  console.log("Root post created with URI:", rootData.uri);

  // Create subsequent posts as replies with proper chaining
  if (textParts.length > 1) {
    let currentByteOffset = Buffer.from(firstPartText).length;
    let parentUri = rootData.uri;
    let parentCid = rootData.cid;

    for (let i = 1; i < textParts.length; i++) {
      const partText = textParts[i];
      const postIndex = i + 1;
      const threadMarker = `🧵${postIndex} of ${actualTotalPosts}. `;
      const fullPostText = threadMarker + partText;

      // Get facets for this segment
      const segmentFacets = getFacetsForSegment(
        partText,
        text,
        facets,
        currentByteOffset
      ).map(f => ({
        ...f,
        index: {
          byteStart: f.index.byteStart + Buffer.from(threadMarker).length,
          byteEnd: f.index.byteEnd + Buffer.from(threadMarker).length
        }
      }));

      console.log(`Creating reply ${postIndex}/${actualTotalPosts}`);

      const replyData = await createThreadReply(
        didResponse,
        resource,
        fullPostText,
        rootData.uri,    // Root stays the same
        rootData.cid,
        parentUri,       // Parent changes to previous post
        parentCid,
        segmentFacets
      );

      // Update parent to this post for next iteration (creates proper chain)
      parentUri = replyData.uri;
      parentCid = replyData.cid;

      currentByteOffset += Buffer.from(partText).length;
      await new Promise(resolve => setTimeout(resolve, 500)); // Increased rate limiting
    }
  }

  return rootData;
}

// Create a single thread reply with proper parent/root structure
async function createThreadReply(
  didResponse: any,
  resource: string,
  text: string,
  rootUri: string,
  rootCid: string,
  parentUri: string,
  parentCid: string,
  facets: any[] = []
) {
  const record: any = {
    createdAt: new Date().toISOString(),
    $type: resource,
    text: text,
    reply: {
      root: {
        uri: rootUri,
        cid: rootCid,
      },
      parent: {
        uri: parentUri,  // This should be the previous post in the chain
        cid: parentCid,
      },
    },
  };

  if (facets.length > 0) {
    record.facets = facets;
  }

  const body = {
    collection: resource,
    repo: didResponse.did,
    record,
  };

  try {
    const response = await axios.post(
      `${config.blueSkyBaseRpcUrl}/com.atproto.repo.createRecord`,
      body,
      {
        headers: {
          "Authorization": `Bearer ${didResponse.accessJwt}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Reply created with URI:", response.data.uri);
    return response.data;
  } catch (error: any) {
    const errorMsg = error.response?.data || error.message;
    console.error(`Failed to create reply: ${errorMsg}`);
    throw error;
  }
}
const getWalletPublicKey = async (token: string): Promise<string> => {
  try {
    const clientInstance = client(token);
    const result = await clientInstance.get("/address");
    return result.data.data
  } catch (err) {
    console.error("Error fetching wallet public key:", err);
    return "null";
  }
}
const hasAdmin = async (publicKey: string): Promise<boolean> => {
  const collection = db.collection("mmosh-users");

  const user = await collection.findOne(
    { wallet: publicKey },
    { projection: { role: 1 } }
  );

  return user?.role === "wizard";
};

// MCP Tool: Create Post with tagging
server.tool(
  "create",
  `Publishes content to Bluesky with optional automatic user mentions and threaded post support.

  This tool creates posts on Bluesky on behalf of a configured or agent-specific account. It can automatically mention users from the Kinship Bots database who have registered Bluesky handles and intelligently splits long-form content into threaded posts when it exceeds character limits.

  **Features**
  - Publishes posts directly to Bluesky using secure credentials  
  - Automatically mentions Kinship Bots users with verified Bluesky accounts  
  - Splits long content into threaded posts (up to 285 characters per post)  
  - Resolves Bluesky handles to DIDs for accurate mention linking  
  - Includes rate limiting for reliable and compliant post sequencing  
  - Filters out spam and invalid Bluesky accounts

  **Parameters**
  - \`text\` *(string, required)* – The post content to publish on Bluesky  
  - \`tagUsers\` *(boolean, optional, default: true)* – Whether to automatically tag Kinship Bots users with Bluesky accounts  
  - \`agentId\` *(string, required)* – The unique worker identifier used to retrieve Bluesky credentials  
  - \`authorization\` *(string, required)* – A valid user authorization token used to verify wallet ownership and permissions  

  **Notes**
  - Posts exceeding 300 bytes are automatically split into threaded posts with 🧵 indicators (e.g., "🧵1 of 3")  
  - Thread replies are properly chained (each post replies to the previous one)
  - Mentions are formatted using Bluesky's rich text facet system for compatibility  
  - Authentication uses securely stored Bluesky credentials retrieved by agent ID  
  - The tool queries the Kinship Bots database to identify users with verified Bluesky handles  
  - Spam filtering removes suspicious accounts based on common patterns  
  - Rate limiting between posts ensures stable operation and API compliance`,
  {
    text: z.string().describe("The content to publish on Bluesky"),
    tagUsers: z.boolean().default(true).describe("Whether to automatically tag Kinship Bots users with Bluesky accounts"),
    workerId: z.string().describe("The unique worker ID used to retrieve Bluesky credentials"),
    authorization: z
      .string()
      .describe("A valid user authorization token used to verify wallet ownership and ensure the user has admin permissions to post on Bluesky"),
  },
  async ({ text, tagUsers, workerId, authorization }) => {
    try {
      if (!authorization) {
        return getResponse("Authorization token is missing.");
      }
      const publicKey = await getWalletPublicKey(authorization);
      if (!publicKey) {
        return getResponse("Wallet not found. Please ensure you are connected.");
      }
      const hasadmin = await hasAdmin(publicKey);
      if (!hasadmin) {
        return getResponse("You don't have permission to create posts on Bluesky. Only the admin is allowed to create posts there.");
      }
      const handleInfo = await getBlueskyCredentials(workerId);
      if (!handleInfo.status) {
        return getResponse(`Failed to create post: ${handleInfo.message}`);
      }
      const didResponse = await authenticateBluesky(handleInfo.result?.handle!, handleInfo.result?.password!);
      const { postData, tagResults } = await createPostWithMentions(
        didResponse,
        "app.bsky.feed.post",
        text,
        tagUsers
      );

      // Build response message with accurate tagging info
      let responseMessage = `Post created successfully!`;
      
      if (tagUsers) {
        if (tagResults.tagged.length > 0) {
          responseMessage += `\n\n✅ Tagged ${tagResults.tagged.length} user(s): ${tagResults.tagged.map(h => `@${h}`).join(", ")}`;
        }
        if (tagResults.failed.length > 0) {
          responseMessage += `\n\n⚠️ Could not tag ${tagResults.failed.length} user(s) (invalid handles): ${tagResults.failed.map(h => `@${h}`).join(", ")}`;
        }
        if (tagResults.tagged.length === 0 && tagResults.failed.length === 0) {
          responseMessage += `\n\nℹ️ No users with Bluesky handles found to tag.`;
        }
      }

      responseMessage += `\n\nURI: ${postData.uri}`;

      return getResponse(responseMessage);
    } catch (error: any) {
      return getResponse(`Failed to create post: ${error.message}`);
    }
  }
);

// MCP endpoint handler
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Existing session handling
  if (sessionId && transports[sessionId]) {
    try {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    } catch (error) {
      console.error("Session handling error:", error);
      return res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: req.body?.id ?? null
      });
    }
  }

  // Initialize new session
  if (isInitializeRequest(req.body)) {
    try {
      const sessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
        enableDnsRebindingProtection: false
      });

      res.setHeader("Mcp-Session-Id", sessionId);
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      await server.connect(transport);
      return transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Initialization error:", error);
      return res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Initialization failed" },
        id: null
      });
    }
  }

  // Invalid request
  res.status(400).json({
    jsonrpc: "2.0",
    error: { code: -32600, message: "Invalid request" },
    id: req.body?.id ?? null
  });
});

// GET/DELETE handlers
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid session ID" },
      id: null
    });
    return;
  }
  await transports[sessionId].handleRequest(req, res);
};

app.get('/mcp', handleSessionRequest);
app.delete('/mcp', handleSessionRequest);

app.get("/health", async (_, res) => {
  res.status(200).json({ status: "healthy" });
});
