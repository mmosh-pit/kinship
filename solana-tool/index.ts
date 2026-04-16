import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { z } from "zod";
import { getProfileInfo, getTokenDetail } from "./utils/commonUtils";
import { config } from "./config/config";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { getWalletPublicKey, signTransaction } from "./utils/wallet";
import { connectToDatabase } from "./config/dbClient";
import { Db } from "mongodb";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));
// app.use(cors({
//   origin: "*",
//   allowedHeaders: ["Content-Type", "Authorization", "mcp-session-id"],
// }));

// Initialize Solana connection
const connection = new Connection(clusterApiUrl(config.network), "confirmed");

// Create MCP server with transport
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

const server = new McpServer({
  name: "Solana RPC Tools",
  version: "1.0.0",
});

let db: any = null;

connectToDatabase()
  .then((database) => {
    db = database;
    console.log("Database connected successfully");

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
  });

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
};

const getCoinInformation = async (
  tokenAddress: string | undefined,
  symbol: string | undefined
): Promise<any> => {
  const result = await getTokenDetail(db, connection, tokenAddress, symbol);
  if (tokenAddress && !result.status) {
    return {
      status: false,
      message: getResponse(
        "Token transfer failed: Cannot get the token detail"
      ),
    };
  }
  if (!result.status) {
    return {
      status: false,
      message: getResponse(
        `Token transfer failed: unsupported token ${symbol}`
      ),
    };
  }
  if (result.status && result.data.length > 1) {
    return {
      status: false,
      message: {
        content: [
          {
            type: "text",
            text: `Multiple tokens found with the same symbol '${symbol}'. Please select one:`,
            _meta: {},
          },
          ...result.data.map((token) => ({
            type: "text" as const,
            text: `${token.name} (${token.symbol}) — ${token.key}`,
            _meta: {},
          })),
        ],
      },
    };
  }
  if (result.status && result.data.length === 1) {
    return {
      status: true,
      message: "",
      result: result.data[0],
    };
  }
};
const getPriorityFeeEstimate = async (transaction: any) => {
  try {
    console.log("----- config.RPC_URL -----", config.RPC_URL);
    const response = await fetch(config.RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            transaction: bs58.encode(
              transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
              })
            ),
            options: { priorityLevel: "High" },
          },
        ],
      }),
    });
    const data = await response.json();
    console.log("----- PRIORITY FEE -----", data.result.priorityFeeEstimate);
    return Math.floor(data.result.priorityFeeEstimate);
  } catch (error) {
    console.log("getPriorityFeeEstimate ", error);
    return 0;
  }
};

// Add token transfer tool
server.tool(
  "transferToken",
  `Transfers tokens (SOL or SPL tokens) between Solana wallets.

  This tool works exclusively on the Solana blockchain and automatically handles all Solana token account setup.  
  If the recipient wallet does not yet have an associated token account (ATA) for the specified token, it will be created automatically before sending — no user confirmation required.

  It securely transfers a specified amount of tokens (e.g., SOL, USDC, or any SPL token) from the authenticated user’s connected Solana wallet to another Solana wallet address.

  Network:
  - The tool operates only on the Solana network. 
  - Network selection or confirmation is never required; the server is preconfigured to connect to the correct Solana cluster internally (e.g., mainnet-beta or devnet).

  Parameters:
  - receiverWallet (string, optional): The recipient’s Solana wallet address. If omitted, the tool will attempt to resolve it using the provided username.
  - supply (number, required): The amount of tokens to transfer. The minimum transferable amount is 0.000000001.
  - symbol (string, optional): The token symbol (e.g., "SOL", "USDC"). Required if tokenAddress is not provided.
  - tokenAddress (string, optional): The token’s mint address. Required if symbol is not provided.
  - username (string, optional): A username used to resolve the receiver’s wallet if receiverWallet is missing.

  Notes:
  - This tool supports **only the Solana network** — cross-chain or non-Solana transfers are not supported.
  - The minimum transferable amount is 0.000000001 tokens (1e-9), ensuring precision for microtransactions.
  - The tool validates both token and SOL balances before attempting a transaction.
  - The tool automatically creates the recipient’s associated token account (ATA) if it does not exist, so no manual confirmation or wallet setup is needed.
  - Supports transfers of native SOL and any SPL tokens.`,
  {
    receiverWallet: z.string().optional(),
    supply: z.number().min(0.000000001),
    symbol: z.string().optional(),
    tokenAddress: z.string().optional(),
    username: z.string().optional(),
  },
  async (
    { receiverWallet, supply, symbol, tokenAddress, username },
    context
  ) => {
    try {
      const auth: any = context.requestInfo?.headers.authorization;
      if (!auth) {
        return getResponse("Authorization token is missing.");
      }
      if (!tokenAddress && !symbol) {
        return getResponse(
          "Missing token address and symbol — please provide both to continue."
        );
      }
      const publicKey = await getWalletPublicKey(auth);
      console.log("===== PUBLIC KEY =====", publicKey);
      if (!publicKey) {
        return getResponse(
          "Wallet not found. Please ensure you are connected."
        );
      }

      const transaction = new Transaction();
      let receiverAddress = receiverWallet || "";
      if (!receiverWallet || receiverWallet === undefined) {
        const result = await getProfileInfo(db, username || "");
        if (result?.length === 0) {
          return getResponse(
            "Token transfer failed: username not found in registry"
          );
        } else if (result?.length > 1) {
          return {
            content: [
              {
                type: "text",
                text: `Multiple wallets found with the same username '${username}'. Please select one:`,
                _meta: {},
              },
              ...result.map((info) => ({
                type: "text" as const,
                text: `${info.username} (${info.receiverWallet}) — ${info.lastName}`,
                _meta: {},
              })),
            ],
          };
        }
        receiverAddress = result[0].receiverWallet;
      }
      let toPubkey = new PublicKey(receiverAddress);

      if (
        symbol?.toUpperCase() === "SOL" ||
        tokenAddress?.toLocaleLowerCase() ===
          "So11111111111111111111111111111111111111112"
      ) {
        const lamports = Math.floor(supply * LAMPORTS_PER_SOL);
        const solBalance = await connection.getBalance(publicKey);
        if (solBalance < lamports + 0.01 * LAMPORTS_PER_SOL) {
          return getResponse(
            `Insufficient SOL balance. Available: ${
              solBalance / LAMPORTS_PER_SOL
            }`
          );
        }
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey,
            lamports,
          })
        );
      } else {
        const tokenInfo = await getCoinInformation(tokenAddress, symbol);
        if (!tokenInfo.status) {
          return tokenInfo.message;
        }
        let coinDetail = tokenInfo.result;

        const transferAmount = BigInt(
          supply * 10 ** Number(coinDetail.decimals)
        );

        // Sender token account
        const sourceAccount = await getAssociatedTokenAddress(
          new PublicKey(coinDetail.key),
          publicKey
        );
        console.log("Reached step 19...");

        // Verify sender has sufficient token balance
        try {
          console.log("Reached step 20...");
          const sourceAccountInfo = await getAccount(connection, sourceAccount);
          console.log("Reached step 20.1...", sourceAccountInfo);
          const solBalance = await connection.getBalance(publicKey);
          if (sourceAccountInfo.amount < transferAmount) {
            console.log("Reached step 21...");
            return getResponse(
              `Insufficient Token balance. Available: ${
                Number(sourceAccountInfo.amount) /
                10 ** Number(coinDetail.decimals)
              }, Required: ${supply}`
            );
          } else if (solBalance < 0.01 * LAMPORTS_PER_SOL) {
            console.log("Reached step 22...");
            // Minimum SOL balance for transaction fees
            return getResponse(
              `Insufficient SOL balance for transaction fees. Minimum required: ${0.01} SOL`
            );
          }
        } catch (error) {
          console.log("Reached step 23...", error);
          return getResponse(
            `We’re sorry, there was an error while trying to transfer the token. Check your wallet and try again. Error: ${JSON.stringify(
              error
            )}`
          );
        }

        // Recipient token account
        const destinationAccount = await getAssociatedTokenAddress(
          new PublicKey(coinDetail.key),
          toPubkey
        );
        console.log("Reached step 24...");

        // Check if recipient account exists
        try {
          console.log("Reached step 25...");
          await getAccount(connection, destinationAccount);
        } catch {
          console.log("Reached step 26...");
          // Create ATA if doesn't exist
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              destinationAccount,
              toPubkey,
              new PublicKey(coinDetail.key)
            )
          );
        }
        console.log("Reached step 27...");

        // Add transfer instruction
        transaction.add(
          createTransferCheckedInstruction(
            sourceAccount,
            new PublicKey(coinDetail.key),
            destinationAccount,
            publicKey,
            transferAmount,
            Number(coinDetail.decimals)
          )
        );
        console.log("Reached step 28...");
      }
      // Finalize transaction
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      console.log("Reached step 30...");

      const feeEstimate = await getPriorityFeeEstimate(transaction);
      let feeIns;
      if (feeEstimate > 0) {
        feeIns = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: feeEstimate,
        });
      } else {
        feeIns = ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        });
      }
      console.log("Reached step 31...");
      transaction.add(feeIns);

      // Sign and send
      const signedTx = await signTransaction(auth, transaction);
      const txSignature = await connection.sendRawTransaction(
        signedTx.serialize()
      );
      console.log("Reached step 32...");
      console.log("Transaction signature:", txSignature);
      return getResponse(txSignature);
    } catch (error) {
      return getResponse(`Token transfer failed: ${JSON.stringify(error)}`);
    }
  }
);
server.tool(
  "getreceiverWallet",
  `Retrieves the Solana wallet address associated with a given username.

  This tool looks up the username in the user registry and returns the corresponding receiver wallet address.

  If multiple wallets are linked to the same username, the tool lists all matching results for user selection.

  Use this tool to resolve or verify a recipient’s wallet address before initiating a token transfer.`,
  {
    username: z.string(),
  },
  async ({ username }) => {
    try {
      const result = await getProfileInfo(db, username || "");
      if (result?.length === 0) {
        return getResponse(
          "Token transfer failed: username not found in registry"
        );
      } else if (result?.length > 1) {
        return {
          content: [
            {
              type: "text",
              text: `Multiple wallets found with the same username '${username}'. Please select one:`,
              _meta: {},
            },
            ...result.map((info) => ({
              type: "text" as const,
              text: `${info.username} (${info.receiverWallet}) — ${info.lastName}`,
              _meta: {},
            })),
          ],
        };
      }
      return getResponse(result[0].receiverWallet);
    } catch (error) {
      return getResponse(
        `failed to get receiver wallet: ${JSON.stringify(error)}`
      );
    }
  }
);

// Connect server to transport
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  console.log("Request received in mcp post endpoint", req.body);
  console.log("Request headers:", JSON.stringify(req.headers, null, 2));
  console.log("MCP Session ID:", req.headers["mcp-session-id"]);

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
        id: req.body?.id ?? null,
      });
    }
  }

  if (isInitializeRequest(req.body)) {
    try {
      // Pre-generate session ID
      const sessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
          console.log(`Session initialized: ${sid}`);
        },
        enableDnsRebindingProtection: false,
      });

      // **Set the header so the client receives the session ID**
      res.setHeader("Mcp-Session-Id", sessionId);
      // If your client is browser-based: expose the header via CORS
      // res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
          console.log(`Session closed: ${sid}`);
        }
      };

      await server.connect(transport);
      return transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Initialization error:", error);
      return res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Initialization failed" },
        id: null,
      });
    }
  }

  // Invalid request
  res.status(400).json({
    jsonrpc: "2.0",
    error: { code: -32600, message: "Invalid request" },
    id: req.body?.id ?? null,
  });
});

// GET/DELETE handlers remain the same
const handleSessionRequest = async (
  req: express.Request,
  res: express.Response
) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "Invalid session ID" },
      id: null,
    });
    return;
  }
  await transports[sessionId].handleRequest(req, res);
};

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.get("/health", async (_: any, res: any) => {
  res.status(200).json("healthy");
});
