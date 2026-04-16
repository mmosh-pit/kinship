import axios from "axios";

export async function fetchNFTMetadata(mintAddress: string) {
  try {
    const response = await axios.post(
      process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
      JSON.stringify({
        jsonrpc: "2.0",
        id: "my-id",
        method: "getAsset",
        params: {
          id: mintAddress,
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const metadata = response.data.result.content.metadata;

    return metadata;
  } catch (err) {
    console.error(err);
    return null;
  }
}
