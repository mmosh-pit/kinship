import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import bs58 from "bs58";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as CommunityConn } from "@/anchor/community";
import { web3Consts } from "@/anchor/web3Consts";
import axios from "axios";
import { init, uploadFile } from "@/app/(main)/lib/firebase";

import { pinFileToShadowDriveBackend } from "@/app/(main)/lib/uploadFileToShdwDrive";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-offer-subscription");
  const offerCollection = db.collection("mmosh-app-project-offer");
  const projectCollection = db.collection("bots");
  const projectCoinCollection = db.collection("mmosh-app-project-coins");
  const tokenCollection = db.collection("mmosh-app-tokens");
  const usercollection = db.collection("users");
  const { searchParams } = new URL(req.url);
  const receiver = searchParams.get("receiver");
  const usdcBalance = searchParams.get("usdcBalance");


  console.log("receiver ==========================>>> ", receiver);
  console.log("usdcBalance ===================> ", usdcBalance); 


  if(!receiver){   
     return NextResponse.json(null, {
      status: 200,
    });
  }

  const data = await collection.findOne({
    wallet: receiver,
    status: "expired",
  });


  console.log("subscription data ==========================>>> ", data);

  if (!data) {
    console.log("no new subscription available");
    return NextResponse.json(data, {
      status: 200,
    });
  }

  console.log("userData ==========================>>> ", data.wallet);
  let userData = await usercollection.findOne({ wallet: data.wallet });
  if (!userData) {
    console.log("User not found");
    return NextResponse.json(null, {
      status: 200,
    });
  }

  let offerData: any = await offerCollection.findOne({ key: data.offer });
  if (!offerData) {
    console.log("offer not available");
    return NextResponse.json(null, {
      status: 200,
    });
  }

  try {
    let projectData: any = await projectCollection.findOne({
      key: offerData.project,
    });
    const projectCoins = await projectCoinCollection
      .find({ projectkey: projectData.key })
      .toArray();

    let coinData: any = await tokenCollection.findOne({
      symbol: projectCoins[0].symbol?.toUpperCase(),
    });
    if (!coinData) {
      coinData = await tokenCollection.findOne({
        symbol: projectCoins[0].symbol,
      });
      if (!coinData) {
        console.log("coin not available");
        return NextResponse.json(null, {
          status: 200,
        });
      }
    }

    const privateKey = process.env.PTV_WALLET!;
    const private_buffer = bs58.decode(privateKey);
    const private_arrray = new Uint8Array(
      private_buffer.buffer,
      private_buffer.byteOffset,
      private_buffer.byteLength / Uint8Array.BYTES_PER_ELEMENT,
    );
    let ptvOwner = Keypair.fromSecretKey(private_arrray);

    let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    let connection = new Connection(rpcUrl, {
      confirmTransactionInitialTimeout: 120000,
    });
    let wallet = new NodeWallet(ptvOwner);

    console.log("wallet.publicKey.toBase58() ", wallet.publicKey.toBase58());
    const env = new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });

    console.log("test 1");

    let projectConn: CommunityConn = new CommunityConn(
      env,
      web3Consts.programID,
      new anchor.web3.PublicKey(offerData.key),
    );

    console.log("test 2");

    let priceInUsd = 0;
    if (coinData.status === "completed") {
      priceInUsd = await axios.get(
        process.env.NEXT_PUBLIC_JUPITER_PRICE_API +
          `?ids=${coinData.target.token},EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
      );
    } else {
      let lastPriceResult = await axios.get(
        process.env.NEXT_PUBLIC_APP_MAIN_URL +
          "/api/token/lastprice?key=" +
          coinData.bonding
      );
      console.log(
        "last price result =================>> ",
        lastPriceResult.data
      );
      const lookupUsdPrice = await axios.get(
        process.env.NEXT_PUBLIC_JUPITER_PRICE_API +
          `?ids=${coinData.base.token},EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
      );
      console.log(
        lookupUsdPrice.data,
        "lookupUsdPrice.data =================>>"
      );
      const tokenInfo = lookupUsdPrice.data["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"];
      const price = tokenInfo?.usdPrice ?? 0.003;
      priceInUsd = lastPriceResult.data.price * price;
    }

    console.log("test 3 priceInUsd", priceInUsd);

    let price: any = 0;
    if (data.type === "month") {
      console.log("offerData.pricemonthly", offerData.pricemonthly);
      price = offerData.pricemonthly;
    } else {
      price = offerData.priceyearly;
    }

    console.log("test 4");
    console.log(price, "price before usd convertion");
    console.log(priceInUsd, "priceInUsd  usd convertion");
    price = price
    console.log("price  ==========>", price);
    // let tokenBalance = await projectConn.getStakeBalance(
    //   new anchor.web3.PublicKey(projectData.coins[0].key),
    // );

    let tokenBalance: any = usdcBalance;
    console.log("tokenBalance ", tokenBalance, " price ", price);

    if (tokenBalance < price) {
      console.log("Insufficent fund");
        return NextResponse.json(
        { status: false, message: "Insufficent fund" },
        { status: 200 }
      );
    }
 
    // const unstakeres = await projectConn.unStakeCoin({
    //   stakeKey: new anchor.web3.PublicKey(data.receiver),
    //   mint: new anchor.web3.PublicKey(projectData.coins[0].key),
    //   amount: Math.ceil(price * 10 ** coinData?.target.decimals),
    // });

    let offerBody = {
      name: offerData.name,
      symbol: offerData.symbol,
      description: offerData.desc,
      image: offerData.image,
      enternal_url:
        "https://www.kinship.systems/" +
        projectData.symbol +
        "/" +
        offerData.symbol,
      family: "Kinship Bots",
      collection: "Kinship Offers",
      attributes: [
        {
          trait_type: "Primitive",
          value: "Offer",
        },
        {
          trait_type: "Ecosystem",
          value: "Kinship Bots",
        },
        {
          trait_type: "Agent Name",
          value: projectData.name,
        },
        {
          trait_type: "Agent Symbol",
          value: projectData.symbol.toUpperCase(),
        },
        {
          trait_type: "Seniority",
          value: offerData.seniority ? offerData.seniority : 1,
        },
        {
          trait_type: "Payments",
          value: offerData.pricetype === "onetime" ? "Single" : "Subscription",
        },
        {
          trait_type: "Denomination",
          value: coinData.symbol.toUpperCase(),
        },
        {
          trait_type: "Upfront Price",
          value: 0,
        },
        {
          trait_type: "Offer",
          value: offerData.key,
        },
      ],
    };

    offerBody.attributes.push({
      trait_type: "Monthly Subscription Price",
      value: offerData.pricemonthly,
    });
    offerBody.attributes.push({
      trait_type: "Annual Subscription Price",
      value: offerData.priceyearly,
    });

    offerBody.attributes.push({
      trait_type: "Valid from",
      value: new Date(),
    });

    let date = new Date(); // Now
    if (data.type === "month") {
      date.setDate(date.getDate() + 30);
      offerBody.attributes.push({
        trait_type: "Valid up to",
        value: date,
      });
    } else if (data.type === "year") {
      date.setDate(date.getDate() + 365);
      offerBody.attributes.push({
        trait_type: "Valid up to",
        value: date,
      });
    }

    offerBody.attributes.push({
      trait_type: "Purchase Type",
      value: data.type,
    });

    offerBody.attributes.push({
      trait_type: "Buyer",
      value: data.receiver,
    });

    offerBody.attributes.push({
      trait_type: "Supply",
      value: 1,
    });

    offerBody.attributes.push({
      trait_type: "Price",
      value: price,
    });

    console.log("offer body", offerBody);

    init();
    const offerFile = new File(
      [JSON.stringify(offerBody)], // file content as string
      `${receiver}.json`, // file name
      { type: "application/json" } // MIME type
    );

    const passMetaURI: string = await uploadFile(
      offerFile,
      receiver,
      "offer-purchase"
    );
    console.log("passMetaURI  from the firebase", passMetaURI);
    if (passMetaURI == "") {
      console.log("error on creating meta uri");
      return NextResponse.json(
        { status: false, message: "Error on creating meta uri" },
        {
          status: 200,
        }
      );
    }
    else {
      let amount =  price * 1
      const supplyValue : number = 1
      return NextResponse.json(
        {
          status: true,
          data: 
            {
        name: offerData.name,
        symbol: offerData.symbol,
        uriHash: passMetaURI,
        genesisProfile: offerData.key,
        commonLut: offerData.lut,
      },
      receiver,
      amount,
      supplyValue,
        },
        {
          status: 200,
        }
      );
    }

    // let result = await projectConn.offerGuestPassTx(
    //   {
    //     name: offerData.name,
    //     symbol: offerData.symbol,
    //     uriHash: passMetaURI,
    //     genesisProfile: offerData.key,
    //     commonLut: offerData.lut,
    //   },
    //   receiver,
    //   receiver,
    //   price * 1,
    //   1
    // );


    // console.log("value from the oferGuestPassTx ", result);
    // if (result.Ok) {
    //   return NextResponse.json(
    //     {
    //       status: true,
    //       signature: result.Ok,
    //     },
    //     {
    //       status: 200,
    //     }
    //   );
    // } else {
    //   return NextResponse.json(
    //     {
    //       status: false,
    //       signature: "",
    //     },
    //     {
    //       status: 200,
    //     }
    //   );
    // }
  } catch (error) {}

  return NextResponse.json(data, {
    status: 200,
  });
}

const delay = (ms: any) => new Promise((res) => setTimeout(res, ms));
