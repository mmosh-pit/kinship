import { web3Consts } from "@/anchor/web3Consts";
import Config from "@/anchor/web3Config.json";
import axios from "axios";

export type JupQuoteParams = {
  inputMint: string;
  outputMint: string;
  lamportValue: number;
};

export type JupSwapParams = {
  quote: any;
  wallet: string;
};

export const getquote = async (params: JupQuoteParams) => {
  try {
    const result = await axios.get(
      process.env.NEXT_PUBLIC_JUPITER_API +
        "/v6/quote?inputMint=" +
        params.inputMint +
        "&outputMint=" +
        params.outputMint +
        "&amount=" +
        params.lamportValue +
        "&slippageBps=50",
    );
    console.log("quoteResponse", result);
    await getSwapTransaction({
      quote: result.data,
      wallet: "FBxcKW6maxysrYSHNLYPDg3qVga9g9DysSVEYoSmfN2A",
    });
    return { status: true, data: result.data };
  } catch (error) {
    return { status: false, data: null };
  }
};


export const getPriceForPTV = async (tokenAddress: any) => {
  try {
    const result = await axios.get(
      "/api/token/lastprice?key=" + tokenAddress,
    );
    return result.data.price || 0;
  } catch (error) {
    return 0;
  }
};

const getPriorityFeeEstimate = async () => {
  try {
    const response = await fetch(Config.rpcURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            accountKeys: ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"],
            options: {
              priorityLevel: "High",
            },
          },
        ],
      }),
    });
    const data = await response.json();
    console.log(
      "Fee in function for",
      "HIGH",
      " :",
      data.result.priorityFeeEstimate,
    );
    return Math.floor(data.result.priorityFeeEstimate);
  } catch (error) {
    console.log("getPriorityFeeEstimate ", error);
    return 0;
  }
};

export const getSwapTransaction = async (params: JupSwapParams) => {
  try {
    const maxLamports = await getPriorityFeeEstimate();
    const result = await axios(
      process.env.NEXT_PUBLIC_JUPITER_API + "/v6/swap",
      {
        method: "post",
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          // quoteResponse from /quote api
          quoteResponse: params.quote,
          // user public key to be used for the swap
          userPublicKey: params.wallet,
          // auto wrap and unwrap SOL. default is true
          wrapAndUnwrapSol: true,
          asLegacyTransaction: false,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              priorityLevel: "high",
              maxLamports: maxLamports,
            },
          },
        }),
      },
    );
    console.log("getSwapTransaction", result);
    return { status: true, data: result.data.swapTransaction };
  } catch (error) {
    return { status: false, data: null };
  }
};


