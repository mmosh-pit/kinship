import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import http from "http";
import { config } from "./config/config";

const mcpClient = new Client({
    name: "Solana RPC Client",
    version: "1.0.0",
});
let serverScriptPath = "./dist/index.js"
const command = process.execPath;
const transport = new StdioClientTransport({
    command,
    args: [serverScriptPath],
});
mcpClient.connect(transport);

http.createServer((req, res) => {
    let body = '';

    req.on('data', data => {
        body += data;
    });

    req.on('end', async () => {
        try {
            const rpcRequest = JSON.parse(body || "{}");
            const { tool, receiver, supply, token } = rpcRequest.params;
            if (tool === "listtools") {
                let result = await mcpClient.listTools();
                res.end(JSON.stringify(result));
            } else if (tool === "transferToken") {
                let result = await mcpClient.callTool({
                    name: tool,
                    arguments: {
                        receiver: receiver,
                        supply: supply,
                        token: token
                    }
                });
                res.end(JSON.stringify(result));
            } else {
                res.end(JSON.stringify({ error: "unsupported tool" }));
            }
        } catch (error) {
            console.log("error", error);
            res.end(error.toString());
        }
    })
}).listen(config.port);