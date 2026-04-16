/**
 * Solana Actions Example
 */
import { BlinksightsClient } from 'blinksights-sdk';
import {
    ActionPostResponse,
    createPostResponse,
    ActionGetResponse,
    ActionPostRequest,
    createActionHeaders,
    ActionError,
  } from "@solana/actions";
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


  const headers = createActionHeaders();
  
  export const GET = async (req: Request) => {
    try {
      let projectInfo:any = await axios.get(process.env.NEXT_PUBLIC_APP_MAIN_URL + "/api/project/detail?symbol=PTV")
      const requestUrl = new URL(req.url);
      const {isValid, tokenInfo} = await validatedQueryParams(requestUrl, projectInfo.data);
      let referer = requestUrl.searchParams.get("referer") ? requestUrl.searchParams.get("referer") : projectInfo.data.project.key

      if(!isValid) {
        let actionError: ActionError = { message: "Project validation failed" };
        return Response.json(actionError, {
          status: 400,
          headers,
        });
      }
  
      const baseHref = process.env.NEXT_PUBLIC_APP_MAIN_URL + `/api/actions/guest-pass?referer=${referer}`
      let apiKey:any = process.env.BLINK_INSIGHT_KEY
      const client = new BlinksightsClient(apiKey);
  
      const payload: ActionGetResponse = await client.createActionGetResponseV1(baseHref,{
        type: "action",
        title: "Pump The Vote and Earn Crypto Rewards!",
        icon: "https://shdw-drive.genesysgo.net/Ejpot7jAYngByq5EgjvgEMgqJjD8dnjN4kSkiz6QJMsH/guestpass.png",
        description: `Pump The Vote is the world’s first PolitiFi Super PAC. Mint your free Guest Pass, create your own political memecoins (free!) and earn 3% of all the trading fees! Enter your first name or alias and email address, and we’ll send you details on how to claim $20 in crypto to start trading political memecoins today. Not only that, you’ll get your own Blink In Bio that you can share for additional crypto referral rewards. Drop us your Telegram and X usernames for extra valuable giveaways!`,
        label: "Mint Option", // this value will be ignored since `links.actions` exists
        links: {
          actions: [
            {
              label: "Mint Pump The Vote Guest Pass", // button text
              href: `${baseHref}&name={name}&email={email}&telegram={telegram}&twitter={twitter}&type={type}`, // this href will have a text input
              parameters: [
                {
                  type: "radio",
                  name: "type", 
                  label: "Pass type", 
                  required: true,
                  options:[{
                    label: "Red Pass (Republican)",
                    value: "Red",
                    selected: false
                  }, {
                    label: "Blue Pass (Democrat)",
                    value: "Blue",
                    selected: false
                  }]
                },
                {
                  type:"text",
                  name: "name", 
                  label: "Enter your first name or alias", 
                  required: true,
                },
                {
                  type: "email",
                  name: "email", 
                  label: "Enter your email address to claim rewards", 
                  required: true,
                },
                {
                  type: "url",
                  name: "telegram", 
                  label: "Enter your Telegram link for bonus rewards", 
                  required: false,
                },
                {
                  type: "url",
                  name: "twitter", 
                  label: "Enter your X link for bonus rewards", 
                  required: false,
                },
              ],
            },
          ],
        },
      });
  
      return Response.json(payload, {
        headers,
      });
    } catch (err) {
      console.log(err);
      let actionError: ActionError = { message: "An unknown error occurred" };
      if (typeof err == "string") actionError.message = err;
      return Response.json(actionError, {
        status: 400,
        headers,
      });
    }
  };
  
  // DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
  // THIS WILL ENSURE CORS WORKS FOR BLINKS
  export const OPTIONS = async () => Response.json(null, { headers });
  
  export const POST = async (req: Request) => {
    try {
      console.log("test1")
      let projectInfo:any = await axios.get(process.env.NEXT_PUBLIC_APP_MAIN_URL + "/api/project/detail?symbol=PTV")
      const requestUrl = new URL(req.url);
      console.log("test2 ")
      const {isValid, tokenInfo} = await validatedQueryParams(requestUrl, projectInfo.data);
      if(!isValid) {
        let actionError: ActionError = { message: "Project validation failed" };
        return Response.json(actionError, {
          status: 400,
          headers,
        });
      }
      console.log("test3")
  
      const body: ActionPostRequest = await req.json();
  
      // validate the client provided input
      let account: PublicKey;
      try {
        account = new PublicKey(body.account);
      } catch (err) {
        throw 'Invalid "account" provided';
      }
      console.log("test4")
      let rpcUrl:any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
      let connection = new Connection(rpcUrl, {
        confirmTransactionInitialTimeout: 120000
      })
      let wallet = new NodeWallet(new Keypair());
      const env = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "processed",
      });
      console.log("test5")
      let projectConn: ProjectConn = new ProjectConn(env, web3Consts.programID, new anchor.web3.PublicKey(projectInfo.data.project.key));
      console.log("test6")
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
              let actionError: ActionError = { message: "User already have pass minted in his account" };
              return Response.json(actionError, {
                status: 400,
                headers,
              });
            }
          }
        }
      }
      
      console.log("test7")
      
      let type= requestUrl.searchParams.get("type")
      const metaBody = {
        name:  type === "Red" ? "Pump The Vote Red" : "Pump The Vote Blue",
        symbol: type === "Red" ? "PTVR" : "PTVB",
        description: type === "Red" ? "Pump The Vote is a PolitiFi project within the MMOSH ecosystem. The Pump The Vote Red project pass is for conservatives united by a desire to protect and strengthen the principles that we believe have made America a great and prosperous nation, such as the principles of limited government, personal responsibility, and the preservation of traditional values. We are proponents of fiscal responsibility, advocating for lower taxes, reduced government spending, and balanced budgets to promote economic growth and ensure long-term sustainability." : "Pump The Vote is a PolitiFi project within the MMOSH ecosystem. The Pump The Vote Blue project pass is for progressives who are deeply committed to the principles of social justice, equality, and the protection of individual rights. We believe in a government that plays an active role in ensuring that all citizens have access to essential services like healthcare, education, and economic opportunities, and that it should work to reduce disparities and promote fairness in society. We are united by a vision of an inclusive America where government acts as a force for good, ensuring that every person has the opportunity to succeed and live a life of dignity, respect and personal freedom.",
        image: type === "Red" ? "https://shdw-drive.genesysgo.net/Ejpot7jAYngByq5EgjvgEMgqJjD8dnjN4kSkiz6QJMsH/Pump%20the%20Vote%20Square%20Icon%20Only%20Red.png" : "https://shdw-drive.genesysgo.net/Ejpot7jAYngByq5EgjvgEMgqJjD8dnjN4kSkiz6QJMsH/Pump%20the%20Vote%20Square%20Icon%20Only%20Blue.png",
        enternal_url: process.env.NEXT_PUBLIC_APP_MAIN_URL + "create/project/" + projectInfo.data.project.symbol,
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
            trait_type: "Party",
            value: type,
          },
          {
            trait_type: "Website",
            value:type === "Red" ? "https://www.pumpthevote.red" : "https://www.pumpthevote.blue",
          },
          {
            trait_type: "Telegram",
            value:projectInfo.data.project.telegram,
          },
          {
            trait_type: "X",
            value:projectInfo.data.project.twitter,
          },
          {
            trait_type: "USER.Email",
            value: requestUrl.searchParams.get("email"),
          },
          {
            trait_type: "USER.Name",
            value: requestUrl.searchParams.get("name"),
          }
        ],
      };

      if(requestUrl.searchParams.get("twitter")) {
        metaBody.attributes.push({
          trait_type: "USER.Twitter",
          value: requestUrl.searchParams.get("twitter"),
        })
      }


      if(requestUrl.searchParams.get("telegram")) {
        metaBody.attributes.push({
          trait_type: "USER.Telegram",
          value: requestUrl.searchParams.get("telegram"),
        })
      }

      if(requestUrl.searchParams.get("referer")) {
        let parentPass:any = requestUrl.searchParams.get("referer");
        let parentInfo = await projectConn.metaplex.nfts().findByMint({
          mintAddress:  new anchor.web3.PublicKey(parentPass)
        })
        metaBody.attributes.push({
          trait_type: "USER.Parent",
          value: parentPass
        });

        if(parentInfo.json?.attributes) {
            for (let index = 0; index < parentInfo.json?.attributes.length; index++) {
              const element = parentInfo.json?.attributes[index];
              if(element.trait_type === "USER.Parent") {
                metaBody.attributes.push({
                    trait_type: "USER.GrandParent",
                    value: element.value
                  });
              }
              if(element.trait_type === "USER.GrandParent") {
                metaBody.attributes.push({
                  trait_type: "USER.GreatGrandParent",
                  value: element.value
                });
              }

              if(element.trait_type === "USER.GreatGrandParent") {
                metaBody.attributes.push({
                  trait_type: "USER.GGreatGrandParent",
                  value: element.value
                });
              }
            }
        }
      }


      const passMetaURI: any = await pinFileToShadowDriveBackend(metaBody, body.account + "_"+type);

      if(passMetaURI==="") {
        let actionError: ActionError = { message: "Creating metadata failed" };
        return Response.json(actionError, {
          status: 400,
          headers,
        });
      }

      console.log("meta image ", passMetaURI)

      let result = await projectConn.mintGuestPassTx({
        name: metaBody.name,
        symbol: metaBody.symbol,
        uriHash: passMetaURI,
        genesisProfile: projectInfo.data.project.key,
        commonLut: projectInfo.data.project.lut
      },body.account, body.account);

      console.log("test8")

    if(result.Ok?.info?.profile) {
      let apiKey:any = process.env.BLINK_INSIGHT_KEY
      const client = new BlinksightsClient(apiKey);
      await client.trackActionV2(body.account, req.url)
      let transaction: VersionedTransaction = result.Ok?.info?.profile;
      const serialized = Buffer.from(transaction.serialize()).toString('base64');
      const payload: ActionPostResponse = {transaction: serialized, message: "Congratulations on minting your free guest pass! Learn how to earn referrals rewards by sharing your personalized blink at https://www.blinkinbio.agency/."};
      return Response.json(payload, {
        headers,
      });
    } else {
      let actionError: ActionError = { message: "Transaction preparation failed" };
      return Response.json(actionError, {
        status: 400,
        headers,
      });
    }
    } catch (err) {
      console.log(err);
      let actionError: ActionError = { message: "An unknown error occurred" };
      if (typeof err == "string") actionError.message = err;
      return Response.json(actionError, {
        status: 400,
        headers,
      });
    }
  };
  
  async function validatedQueryParams(requestUrl: URL, projectInfo:any) {
    try {
      let referer = requestUrl.searchParams.get("referer") ? requestUrl.searchParams.get("referer") : projectInfo.project.key

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
      let creator = tokenInfo.creators[0].address
      if(!requestUrl.searchParams.get("referer")) {
        return {
          isValid: true,
          tokenInfo: tokenInfo
        }
      }

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
