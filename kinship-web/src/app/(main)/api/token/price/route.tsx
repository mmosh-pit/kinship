import axios from "axios";
import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import { web3Consts } from "@/anchor/web3Consts";

export async function GET(req: NextRequest) {
    const collection = db.collection("mmosh-app-token-price");

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ? searchParams.get("type") : "day";
    const key = searchParams.get("key")

    let priceresult = await collection.find({key: key}).limit(1).sort({ created_date: -1 }).toArray()

    let price = 0;
    if(priceresult.length > 0) {
        price = priceresult[0].price
    }


    let supply = 0
    let fdv = 0
    if(key) {
        let tokenAddress;
        if(key == "ExV3Uvf3gYewjMBsakGv6waREX5zHhYrdHsR2CDEGEp5") {
            tokenAddress = "CUQ7Tj9nWHFV39QvyeFCecSRXLGYQNEPTbhu287TdPMX"
        } else if (key == "EJqdJEJCQ2MbAfH21TqogMX3auBPta9vXvhHioeLz8G7") {
            tokenAddress = "H8hgJsUKwChQ96fRgAtoP3X7dZqCo7XRnUT8CJvLyrgd"
        } else if (key == "6vgT7gxtF8Jdu7foPDZzdHxkwYFX9Y1jvgpxP8vH2Apw") {
            tokenAddress = "FwfrwnNVLGyS8ucVjWvyoRdFDpTY8w6ACMAxJ4rqGUSS"
        } else {
            tokenAddress = key
        }
        const tokenData = await getTokenData(tokenAddress)
        if(tokenData) {
            fdv = (tokenData.data.attributes.total_supply * price) / web3Consts.LAMPORTS_PER_OPOS
            supply = tokenData.data.attributes.total_supply
        }
    }

    let data = [];
    for (let index = 0; index < 7; index++) {
        let startDate;
        let endDate;
        if(type == "day") {
            startDate = new Date(new Date(new Date().setDate(new Date().getDate() - index)).setHours(0,0,0,0));
            endDate = new Date(new Date(new Date().setDate(new Date().getDate() - index)).setHours(23,59,59,59));
        } else if(type == "week") {
            startDate = new Date(new Date(new Date().setDate(new Date().getDate() - index * 7)).setHours(0,0,0,0));
            let indexMinus = index == 0 ? index : index - 1
            endDate = new Date(new Date(new Date().setDate(new Date().getDate() - indexMinus * 7)).setHours(23,59,59,59));
        } else if(type == "month") {
            let monthDate = new Date(new Date().setMonth(new Date().getMonth() - index))
            startDate = new Date(new Date(monthDate.getFullYear(),monthDate.getMonth(),1).setHours(0,0,0,0));
            endDate = new Date(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).setHours(23,59,59,59));
        } else if(type == "year") {
            let xValue = new Date().getFullYear() - index;

            startDate = new Date(new Date(xValue,1, 1).setHours(0,0,0,0));
            endDate = new Date(new Date(xValue, 12, 31).setHours(23,59,59,59));
        }

        if(startDate && endDate) {
            let result = await collection.find({key: key, created_date:{$gte:startDate, $lt: endDate}}).sort("-created_date").toArray()

            let chartData = parsePriceByInterval(startDate, endDate,result, type)
            for (let index = 0; index < chartData.length; index++) {
                const element = chartData[index];
                data.push(element)
            }
        }

    }


    return NextResponse.json({
        price: price,
        prices: data,
        supply,
        fdv
    },
        {
          status: 200,
        },
    );
}

const parsePriceByInterval = (startDate: Date, endDate: Date, data:any, type:any) => {
    let currentDate = endDate;
    let chartData = []

    while(currentDate.getTime() > startDate.getTime()) {
        let newDate = new Date(currentDate.getTime() - chartTimeInterval(type)*60000);
        let series = data.filter((item: any) => {
            return new Date(item.created_date).getTime() >= newDate.getTime() &&  new Date(item.created_date).getTime() < currentDate.getTime();
        });
        let prices = []
        for (let index = 0; index < series.length; index++) {
            const element = series[index];
            prices.push(element.price)
        }
        chartData.push({
            x: currentDate.getTime(),
            y: prices
        })
        currentDate = newDate;
    }
    return chartData
}

const chartTimeInterval = (type:any) => {
    if(type == "day") {
        return 30 // 30 mins
    } else if(type == "week") {
        return 45 // 2 1/2 hours
    } else if(type == "month") {
        return 300 // 15 hours 
    } else if(type == "year") {
        return 3600 // 7.5 days 
    }

    return 0
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