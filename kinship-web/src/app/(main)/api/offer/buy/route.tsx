import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/mongoClient";
import bs58 from "bs58";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as CommunityConn } from "@/anchor/community";
import { web3Consts } from "@/anchor/web3Consts";
import axios from "axios";
import { pinFileToShadowDriveBackend } from "@/app/(main)/lib/uploadFileToShdwDrive";
import { init, uploadFile } from "@/app/(main)/lib/firebase";
import { status } from "@/app/(main)/store";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-offer");
  const { receiver, symbol, type, supply, profileInfo } = await req.json();

  const offerCollection = db.collection("mmosh-app-project-offer");
  const projectCollection = db.collection("bots");
  const projectCoinCollection = db.collection("mmosh-app-project-coins");
  const tokenCollection = db.collection("mmosh-app-tokens");
  const usercollection = db.collection("users");

  let userData = await usercollection.findOne({ wallet: receiver });
  if (!userData) {
    console.log("User not found");
    return NextResponse.json(
      { status: false, message: "User not found" },
      {
        status: 200,
      }
    );
  }

  let offerData: any = await offerCollection.findOne({
    symbol: symbol?.toUpperCase(),
  });
  if (!offerData) {
    offerData = await offerCollection.findOne({ symbol: symbol });
    if (!offerData) {
      console.log("offer not available");
      return NextResponse.json(
        { status: false, message: "Offer not available" },
        {
          status: 200,
        }
      );
    }
  }

  if (offerData.supply > 0) {
    console.log(
      offerData,
      "offer data from teh api ===============================>>"
    );
    console.log(supply, "supply =======================================>>");
    if (offerData.supply < offerData.sold + supply) {
      console.log("insufficent supply");
      return NextResponse.json(
        { status: false, message: "Insufficent supply" },
        {
          status: 200,
        }
      );
    }
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
        return NextResponse.json(
          { status: false, message: "Coin not available" },
          {
            status: 200,
          }
        );
      }
    }

    const privateKey = process.env.PTV_WALLET!;
    const private_buffer = bs58.decode(privateKey);
    const private_arrray = new Uint8Array(
      private_buffer.buffer,
      private_buffer.byteOffset,
      private_buffer.byteLength / Uint8Array.BYTES_PER_ELEMENT
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
    console.log(offerData.key,"from the frontEnd ==============================>>")

    let projectConn: CommunityConn = new CommunityConn(
      env,
      web3Consts.programID,
      new anchor.web3.PublicKey(offerData.key)
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

      console.log(lookupUsdPrice.data, "lookupUsdPrice.data =================>>");
      const tokenInfo = lookupUsdPrice.data["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"];
      const price = tokenInfo?.usdPrice ?? 0.003; 
      priceInUsd = lastPriceResult.data.price * price;

    
      console.log("price in usd ========================>> ", priceInUsd);
    }

    console.log("test 3 priceInUsd", priceInUsd);

    let price: any = 0;
    if (type === "onetime") {
      console.log(offerData, "offer data for one time price");
      console.log("one time price from ");
      price = offerData.priceonetime;
    } else if (type === "month") {
      price = offerData.pricemonthly;
    } else {
      price = offerData.priceyearly;
    }

    console.log("test 4");

    let hasInivtation: any = false;

    if (offerData.discount > 0) {
      console.log("-------------step 5b---------------------");
      hasInivtation = await projectConn.isCreatorInvitation(
        new anchor.web3.PublicKey(offerData.badge),
        receiver
      );
      if (hasInivtation > 0) {
        console.log("-------------step 6---------------------");

        let discount = Number(price) * (Number(offerData.discount) / 100);
        price = (Number(price - discount) / priceInUsd).toFixed(2);
      } else {
        console.log("-------------step 57---------------------");

        price = (Number(price) / priceInUsd).toFixed(2);
      }
    } else {
      console.log(price, "price =====================>");
      price = price;
      // price = (Number(price) / priceInUsd).toFixed(2);
    }

    if (offerData.invitationype === "required" && !hasInivtation) {
      console.log("Invitation required to mint offer");
      return NextResponse.json(null, { status: 200 });
    }

    console.log("token price", price);

    console.log(
      coinData,
      "coin data ====> value from teh api ==================>"
    );

    // let tokenBalance: any = await projectConn.getUserBalance({
    //   address: new anchor.web3.PublicKey(receiver).toBase58(),
    //   token: coinData.target.token,
    //   decimals:  coinData.target.decimals,
    // });

    let tokenBalance: any = profileInfo?.usdcBalance;

    console.log("balance from the header  ========>", tokenBalance);
    console.log(price, "price ====>");
    console.log(supply, "supply ====>");
    console.log(price * supply, "total price from teh api ============>");

    if (tokenBalance < price * supply) {
      return NextResponse.json(
        { status: false, message: "Insufficent fund" },
        { status: 200 }
      );
    }

    let offerBody = {
      name: offerData.name,
      symbol: offerData.symbol,
      description: offerData.desc,
      image: offerData.image,
      enternal_url:
        "https://www.kinshipbots.codes/" + symbol + "/" + offerData.symbol,
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

    if (offerData.pricetype === "onetime") {
      offerBody.attributes.push({
        trait_type: "Initial Price",
        value: offerData.priceonetime,
      });
    } else {
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
      if (type === "month") {
        date.setDate(date.getDate() + 30);
        offerBody.attributes.push({
          trait_type: "Valid up to",
          value: date,
        });
      } else if (type === "year") {
        date.setDate(date.getDate() + 365);
        offerBody.attributes.push({
          trait_type: "Valid up to",
          value: date,
        });
      }
    }

    offerBody.attributes.push({
      trait_type: "Purchase Type",
      value: type,
    });

    if (offerData.discount > 0) {
      offerBody.attributes.push({
        trait_type: "Discount",
        value: offerData.discount + "%",
      });
    }

    offerBody.attributes.push({
      trait_type: "Buyer",
      value: receiver,
    });

    offerBody.attributes.push({
      trait_type: "Supply",
      value: supply,
    });

    offerBody.attributes.push({
      trait_type: "Price",
      value: price * supply,
    });

    console.log("offer body", offerBody);

    // const passMetaURI: any = await pinFileToShadowDriveBackend(
    //   offerBody,
    //   receiver,
    // );

    init();
    const offerFile = new File(
      [JSON.stringify(offerBody)], // file content as string
      `${receiver}.json`, // file name
      { type: "application/json" } // MIME type
    );

    // Now call your upload function
    const passMetaURI: string = await uploadFile(
      offerFile,
      receiver,
      "offer-purchase"
    );
    console.log("passMetaURI ", passMetaURI);
    if (passMetaURI == "") {
      console.log("error on creating meta uri");
      return NextResponse.json(
        { status: false, message: "Error on creating meta uri" },
        {
          status: 200,
        }
      );
    }

    console.log(offerData.key,"offerData.key ============================>>")
    let result;
    let supplyValue = price * supply
    // if (!hasInivtation) {
    //   console.log("minting without invitation");
    //   console.log("minting guest pass");
    //   result = await projectConn.offerGuestPassTx(
    //     {
    //       name: offerData.name,
    //       symbol: offerData.symbol,
    //       uriHash: passMetaURI,
    //       genesisProfile: offerData.key,
    //       commonLut: offerData.lut,
    //     },
    //     receiver,
    //     receiver,
    //     price * supply,
    //     Oksupply
    //   );
    // } else {
    //   console.log("minting with invitation");
    //   result = await projectConn.mintPassTx(
    //     {
    //       name: offerData.name,
    //       symbol: offerData.symbol,
    //       uriHash: passMetaURI,
    //       activationToken: offerData.badge,
    //       genesisProfile: offerData.key,
    //       commonLut: offerData.lut,
    //     },
    //     receiver,
    //     receiver,
    //     price * 10 ** coinData.target.decimals * supply,
    //     supply
    //   );
    // }

    console.log(
      "result  from the  mintGuestPassTx @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
      result
    );
    if (!hasInivtation) {
      return NextResponse.json(
        {
          status: true,
          data : {
          name: offerData.name,
          symbol: offerData.symbol,
          uriHash: passMetaURI,
          genesisProfile: offerData.key,
          commonLut: offerData.lut,
          },
        receiver,
        supplyValue,
        supply
        },
        {
          status: 200,
        }
      );
    } else {
      return NextResponse.json(
        {
          status: false,
          signature: "",
        },
        {
          status: 200,
        }
      );
    }
  } catch (error) {
    console.log("error ", error);
    return NextResponse.json(
      { status: false, message: "Something went wrong" },
      {
        status: 200,
      }
    );
  }
}
