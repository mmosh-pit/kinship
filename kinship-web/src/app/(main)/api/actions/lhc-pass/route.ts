import {
    Authorized,
    clusterApiUrl,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    StakeProgram,
    Transaction,
    VersionedTransaction,
  } from "@solana/web3.js";
  import { Connectivity as ProjectConn } from "@/anchor/community";
  import * as anchor from "@coral-xyz/anchor";
import { web3Consts } from "@/anchor/web3Consts";
import axios from "axios";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { pinFileToShadowDrive, pinFileToShadowDriveBackend } from "@/app/(main)/lib/uploadFileToShdwDrive";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
      console.log("test1")
      let projectInfo:any = await axios.get(process.env.NEXT_PUBLIC_APP_MAIN_URL + "/api/project/detail?symbol=LHC")

      const {isValid, tokenInfo} = await validatedQueryParams(projectInfo.data);
      if(!isValid) {
        return NextResponse.json( { message: "Project validation failed" }, {
          status: 400,
        });
      }
      console.log("test3")
  
      const body = await req.json();

      console.log("test4 ", body)
  
      // validate the client provided input
      let account: PublicKey;
      try {
        account = new PublicKey(body.account);
      } catch (err) {
        throw 'Invalid "account" provided';
      }
      let rpcUrl:any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
      let connection = new Connection(rpcUrl, {
        confirmTransactionInitialTimeout: 120000
      })
      let wallet = new NodeWallet(new Keypair());
      const env = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "processed",
      });
      let projectConn: ProjectConn = new ProjectConn(env, web3Consts.programID, new anchor.web3.PublicKey(projectInfo.data.project.key));
      const passCollection = web3Consts.passCollection;
      const userNfts = await projectConn.getUserNFTs(body.account);

      for (let i of userNfts) {
        const collectionInfo = i?.collection;
        if (
          collectionInfo?.address.toBase58() == passCollection.toBase58()
        ) {
          const metadata = await projectConn.getProfileMetadataByProject(i?.uri);
          if (metadata) {
            if(metadata.project == projectInfo.data.project.key) {
              let actionError = { message: "User already have pass minted in his account" };
              return NextResponse.json(actionError, {
                status: 400,
              });
            }
          }
        }
      }
      
      const metaBody = {
        name:  "Liquid Hearts Club Guest Pass",
        symbol: "LHCGP",
        description: "Liquid Hearts Club is a privacy super app within the MMOSH ecosystem. The Liquid Hearts Club Guest Pass provides access to all available resources with the exception of referral rewards, which require a Profile granting Liquid Hearts Club membership.",
        image: "https://shdw-drive.genesysgo.net/FuBjTTmQuqM7pGR2gFsaiBxDmdj8ExP5fzNwnZyE2PgC/lhc.jpg",
        enternal_url: "https://kinship.systems",
        family: "MMOSH",
        collection: "MMOSH Pass Collection",
        attributes: [
          {
            trait_type: "Project",
            value:projectInfo.data.project.key,
          },
          {
            trait_type: "Primitive",
            value:"Pass",
          },
          {
            trait_type: "Ecosystem",
            value:"MMOSH",
          },
          {
            trait_type: "Founder",
            value:"Moto",
          },
          {
            trait_type: "Seniority",
            value:projectInfo.data.project.seniority + 1,
          },
          {
            trait_type: "Website",
            value:"https://www.liquidhearts.club",
          },
          {
            trait_type: "Telegram",
            value:"https://t.me/liquidheartsbot",
          },
          {
            trait_type: "X",
            value:"https://x.com/liquidheartsXOX",
          },
          {
            trait_type: "Genesis_Address",
            value: body.gensisaddress,
          },
          {
            trait_type: "Genesis_Type",
            value: body.gensistype,
          },
          {
            trait_type: "Connected_Wallet",
            value: body.connectedwallet,
          }
        ],
      };


      const passMetaURI: any = await pinFileToShadowDriveBackend(metaBody, body.account);

      if(passMetaURI==="") {
        let actionError = { message: "Creating metadata failed" };
        return NextResponse.json(actionError, {
          status: 400,
        });
      }

      console.log("meta image ", passMetaURI)

      let result = await projectConn.mintGuestPassTx({
        name: metaBody.name,
        symbol: metaBody.symbol,
        uriHash: passMetaURI,
        genesisProfile: projectInfo.data.project.key,
        commonLut: projectInfo.data.project.lut
      },body.account, body.payer);


    if(result.Ok?.info?.profile) {
  
      let transaction: VersionedTransaction = result.Ok?.info?.profile;
      const serialized = Buffer.from(transaction.serialize()).toString('base64');
      const payload = {transaction: serialized, message: "Congratulations on minting your free guest pass!."};
      return NextResponse.json(payload,{
        status: 200
      });
    } else {
      let actionError = { message: "Transaction preparation failed" };
      return NextResponse.json(actionError, {
        status: 400,
      });
    }
    } catch (err) {
      console.log(err);
      let actionError = { message: "An unknown error occurred" };
      if (typeof err == "string") actionError.message = err;
      return NextResponse.json(actionError, {
        status: 400,
      });
    }
  };


  async function validatedQueryParams(projectInfo:any) {
    try {
      let referer = projectInfo.project.key

      let rpcUrl:any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
      let connection = new Connection(rpcUrl, {
        confirmTransactionInitialTimeout: 120000
      })
      let wallet = new NodeWallet(new Keypair());
      const env = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "processed",
      });
      let projectConn: ProjectConn = new ProjectConn(env, web3Consts.programID, new anchor.web3.PublicKey(projectInfo.project.key));
      let pass = new PublicKey(referer);
      let tokenInfo = await projectConn.metaplex.nfts().findByMint({
        mintAddress: pass
      })

      return {
        isValid: true,
        tokenInfo: tokenInfo
      }


    } catch (err) {
      console.log("test", err)
      return {
        isValid: false,
        tokenInfo: null
      }
    }
  }
