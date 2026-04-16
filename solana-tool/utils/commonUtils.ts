import { PublicKey, Connection } from "@solana/web3.js"
import { getMint } from "@solana/spl-token";
import { Db } from "mongodb";
import { config } from "../config/config";
import axios from "axios";

export const getTokenMintAddress = (token: string) => {
    let mint: any = {}
    if (config.network === "devnet") {
        mint = {
            "MMOSH": { key: new PublicKey("6vgT7gxtF8Jdu7foPDZzdHxkwYFX9Y1jvgpxP8vH2Apw"), decimals: 9, name: "MMOSH: The Forge Test", symbol: "MMOSH" },
            "USDC": { key: new PublicKey("B8Aro8APukLUA79eqd1pVC2eZpD5VqwhRMYfgziDUMUc"), decimals: 6, name: "USDC Devnet", symbol: "USDC" },
        }
    } else if (config.network === "mainnet-beta") {
        mint = {
            "MMOSH": { key: new PublicKey("6vgT7gxtF8Jdu7foPDZzdHxkwYFX9Y1jvgpxP8vH2Apw"), decimals: 9, name: "MMOSH", symbol: "MMOSH" },
            "USDC": { key: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6, name: "USD Coin", symbol: "USDC" },
        }
    }
    return mint[token.toUpperCase()] || null;
}

export const getCoinDetails = async (db: Db, symbol: string) => {
    try {
        const coinsCollection = db.collection("mmosh-app-project-coins");
        const coins = await coinsCollection.findOne({ symbol });
        return coins;
    } catch (error) {
        console.log("error getting token info from the db...", error);
        return null;
    }
}



export const getTokenInfoFromJupiter = async (symbol: string) => {
    try {
        console.log("searching in Jupiter...");
        const matchedTokens = [];
        const result = await axios.get(config.JUPITER_RPC_URL + "all");
        for (let index = 0; index < result.data.length; index++) {
            const element = result.data[index];
            if (element.symbol.toUpperCase() === symbol.toUpperCase()) {
                matchedTokens.push(element);
            }
        }

        return matchedTokens;
    } catch (error) {
        return [];
    }
}

export const getTokenDecimals = async (tokenAddress: string, connection: Connection) => {
    try {
        const mintPublicKey = new PublicKey(tokenAddress);
        const mintInfo = await getMint(connection, mintPublicKey);
        return mintInfo.decimals;
    } catch (error) {
        console.error("Error fetching token decimals:", error);
        return null;
    }
}

export const getTokenDetail = async (db: any, connection: Connection, tokenAddress: string | undefined, symbol: string | undefined) => {
    try {
        console.log("-----FUNCTION CALLED 1-----");
        const tokenDetails: { key: string; decimals: number, name: string, symbol: string }[] = [];

        console.log("-----FUNCTION CALLED 2-----");
        if (tokenAddress) {
            const decimals = await getTokenDecimals(tokenAddress, connection);
            if (decimals) {
                return {
                    status: true,
                    data: [{ key: tokenAddress, decimals, name: "", symbol: "" }]
                };
            } else {
                return {
                    status: false,
                    data: []
                };
            }
        }
        console.log("-----FUNCTION CALLED 3-----");
        if (symbol) {
            console.log("-----FUNCTION CALLED 4-----");
            const mintInfo = getTokenMintAddress(symbol) ?? await getCoinDetails(db, symbol);
            console.log("-----mintInfo-----", mintInfo);
            if (mintInfo) {
                console.log("-----inside condition-----");
                tokenDetails.push({ key: mintInfo.key.toString(), decimals: mintInfo.decimals, name: mintInfo.name || "", symbol: mintInfo.symbol || "" });
            }
            console.log("symbol.toUpperCase()", symbol.toUpperCase());
            if (symbol.toUpperCase() !== "MMOSH" && symbol.toUpperCase() !== "USDC") {
                const jupiterTokens = await getTokenInfoFromJupiter(symbol);
                if (jupiterTokens?.length > 0) {
                    tokenDetails.push(
                        ...jupiterTokens.map(token => ({
                            key: token.address,
                            decimals: token.decimals,
                            name: token.name,
                            symbol: token.symbol
                        }))
                    );
                }
            }

        }
        console.log("tokenDetails", tokenDetails);
        return {
            status: tokenDetails.length > 0,
            data: tokenDetails,
        }
    } catch (error) {
        console.log("-----FUNCTION CALLED 5-----", error);
        return {
            status: false,
            data: [],
        }
    }
};

export const getProfileInfo = async (db: Db, username: string) => {
    try {
        const userCollection = db.collection("mmosh-users");
        const regex = new RegExp(`^${username}$`, "i");
        console.log("regex", regex);
        const userInfo = await userCollection.find({
            $or: [
                { "profile.username": regex },
                { "profile.lastName": regex },
                { "profile.name": regex },
                { "profile.displayName": regex }
            ]
        }).toArray();
        console.log("userInfo", userInfo);
        const response = [];
        for (let index = 0; index < userInfo.length; index++) {
            const element = userInfo[index];
            response.push({
                username: element.profile.username,
                receiverWallet: element.wallet,
                lastName: element.profile.lastName,
            })
        }
        console.log("----- RESPONSE -----", response);
        return response;
    } catch (error) {
        console.log("error getting token info from the db...", error);
        return [];
    }
}