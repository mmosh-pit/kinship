import axios from "axios"
import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {


    const { searchParams } = new URL(req.url);
    const coin:any = searchParams.get("coin");

    const result = await getTokenData(coin)

    if(coin) {
        return NextResponse.json({token:result}, {
            status: 200,
         });
    } else {
        return NextResponse.json({token:null}, {
            status: 200,
         });
    }
}
  


const getTokenData = async (tokenaddress:string) => {
    try {
      const tokenData = await axios.get(process.env.COINGECKO_PUBLIC_URL + "onchain/networks/solana/tokens/"+tokenaddress+"?include=top_pools",{
        headers: { 
          "accept": "application/json",
          "x-cg-pro-api-key": process.env.COINGECKO_API_KEY
        },
      })
      if(tokenData.status == 200) {
        return tokenData.data
      }
      return null
    } catch (error) {
      return null
    }
  }
    