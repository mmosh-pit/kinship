import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import axios from "axios";

import { Connectivity as ProjectConn } from "@/anchor/project";
import { CreateCommunityParams } from "@/app/(main)/models/createCommunityParams";
import { MintResultMessage } from "@/app/(main)/models/mintResultMessage";
import { web3Consts } from "@/anchor/web3Consts";
import { calcNonDecimalValue } from "@/anchor/curve/utils";
import { pinFileToShadowDrive } from "../uploadFileToShdwDrive";
import { capitalizeString } from "../capitalizeString";
import { getPronouns } from "../getPronouns";
import { deleteShdwDriveFile } from "../deleteShdwDriveFile";
import { uploadImageFromBlob } from "../uploadImageFromBlob";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function createCommunity({
  wallet,
  discount,
  invitationPrice,
  profileCost,
  name,
  symbol,
  description,
  telegram,
  invitationImage,
  genesisImage,
  priceDistribution,
  pronouns,
  minterUsername,
  passImage,
  setMintingStatus,
  userProfile,
  topics,
  minterName,
  coin,
}: CreateCommunityParams): Promise<MintResultMessage> {
  let passImageUri = "";
  let invitationImageUri = "";
  let shdwHash = "";
  let shdwHashInvite = "";

  try {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
      confirmTransactionInitialTimeout: 120000
    });

    const env = new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });

    const projectKeyPair = anchor.web3.Keypair.generate();

    const projectConn: ProjectConn = new ProjectConn(
      env,
      web3Consts.programID,
      projectKeyPair.publicKey,
    );

    let invPrice = invitationPrice;
    if (discount !== "") {
      invPrice = invPrice - invPrice * (Number(discount) / 100);
    }
    console.log("invPrice ", invPrice)

    const profileMintingCost = new anchor.BN(
      calcNonDecimalValue(profileCost, 9),
    );
    const invitationMintingCost = new anchor.BN(
      calcNonDecimalValue(invPrice, 9),
    );

    setMintingStatus("Preparing Pass Image...");

    passImageUri = await uploadImageFromBlob(genesisImage);

    if(invPrice > 0) {
      setMintingStatus("Preparing Invitation Image...");
      if (invitationImage) {
        invitationImageUri = await uploadImageFromBlob(invitationImage);
      }
    }


    setMintingStatus("Preparing Metadata...");
    const body = {
      name: name,
      symbol: symbol,
      description: description,
      image: passImageUri,
      enternal_url: process.env.NEXT_PUBLIC_APP_MAIN_URL,
      family: "MMOSH",
      collection: "MMOSH Pass Collection",
      attributes: [
        {
          trait_type: "Primitive",
          value: "Pass",
        },
        {
          trait_type: "MMOSH",
          value: " Genesis MMOSH",
        },
        {
          trait_type: "Community",
          value: projectKeyPair.publicKey.toBase58(),
        },
        {
          trait_type: "Seniority",
          value: "0",
        },
        {
          trait_type: "Creator",
          value: minterName,
        },
      ],
    };

    const duptopics: string[] = [];
    for (let index = 0; index < topics.length; index++) {
      if (!duptopics.includes(topics[index])) {
        duptopics.push(topics[index]);
        body.attributes.push({
          trait_type: "Topic",
          value: topics[index],
        });
      }
      body.attributes.push({
        trait_type: "Interest",
        value: topics[index],
      });
    }

    shdwHash = await pinFileToShadowDrive(body);

    if (shdwHash === "") {
      await deleteShdwDriveFile(passImageUri);
      await deleteShdwDriveFile(invitationImageUri);
      return {
        type: "error",
        message:
          "We’re sorry, there was an error while trying to prepare meta url. please try again later.",
      };
    }

    setMintingStatus("Creating Gensis Pass...");

    const res1 = await projectConn.mintGenesisPass({
      name,
      symbol,
      uri: shdwHash,
      mintKp: projectKeyPair,
      input: {
        oposToken: new anchor.web3.PublicKey(coin.token),
        profileMintingCost,
        invitationMintingCost,
        mintingCostDistribution: {
          parent: 100 * priceDistribution.curator,
          grandParent: 100 * priceDistribution.creator,
          greatGrandParent: 100 * priceDistribution.promoter,
          ggreatGrandParent: 100 * priceDistribution.scout,
          genesis: 100 * priceDistribution.ecosystem,
        },
        tradingPriceDistribution: {
          seller: 100 * priceDistribution.curator,
          parent: 100 * priceDistribution.creator,
          grandParent: 100 * priceDistribution.promoter,
          greatGrandParent: 100 * priceDistribution.scout,
          genesis: 100 * priceDistribution.ecosystem,
        },
      },
    });

    const genesisProfileStr = res1.Ok?.info?.profile;

    setMintingStatus("Waiting for Confirmation...");

    await delay(15000);

    projectConn.setMainState();



    if(invPrice > 0) {

      setMintingStatus("Preparing Badge Metadata...");
      let desc =
        "Cordially invites you to join on the " +
        capitalizeString(name) +
        ". The favor of a reply is requested.";
      if (name != "") {
        desc =
          capitalizeString(name) +
          " cordially invites you to join " +
          getPronouns(pronouns) +
          " on the MMOSH. The favor of a reply is requested.";
      }
      const inviteBody = {
        name: name != "" ? "Invitation from join " + name : "Invitation",
        symbol: symbol,
        description: desc,
        image: invitationImageUri,
        external_url: process.env.NEXT_PUBLIC_APP_MAIN_URL,
        minter: minterUsername,
        attributes: [
          {
            trait_type: "Community",
            value: projectKeyPair.publicKey.toBase58(),
          },
          {
            trait_type: "Seniority",
            value: "0",
          },
        ],
      };
      shdwHashInvite = await pinFileToShadowDrive(inviteBody);
      if (shdwHashInvite === "") {
        return {
          type: "error",
          message:
            "We’re sorry. An error occurred while trying to deploy your community and mint your assets. Please check your wallet and try again.",
        };
      }
      setMintingStatus("Creating Badge Account...");
      const uri = shdwHashInvite;
      const res2: any = await projectConn.initBadge({
        name: "Invitation",
        symbol: "INVITE",
        uri,
        profile: genesisProfileStr!,
      });

      setMintingStatus("Waiting for Confirmation...");
      await delay(15000);

      setMintingStatus("Minting Badges...");

      await projectConn.createBadge({
        amount: 100,
        subscriptionToken: res2.Ok.info.subscriptionToken,
      });

      setMintingStatus("Waiting for Confirmation...");
      await delay(15000);

    }


    setMintingStatus("Creating LUT Registration...");
    const res4: any = await projectConn.registerCommonLut();

    setMintingStatus("Buying new Community...");
    const res5 = await projectConn.sendProjectPrice(userProfile);

    if (res5.Ok) {
      await axios.patch("/api/update-community-info", {
        profileAddress: userProfile,
        data: {
          image: passImage,
          passImage: passImageUri,
          inviteImg: invitationImageUri,
          coinImage: coin.image,
          project: genesisProfileStr,
          tokenAddress: coin.token,
          telegram,
          seniority: 0,
          lut: res4.Ok.info.lookupTable,
        },
        completed: true,
      });

      return {
        type: "success",
        message:
          "Congrats! Your community has been deployed to the Solana blockchain and your assets have been sent to your wallet.",
      };
    } else {
      return {
        type: "error",
        message:
          "We’re sorry. An error occurred while trying to deploy your community and mint your assets. Please check your wallet and try again.",
      };
    }
  } catch (error) {
    console.log(error);
    await Promise.all([
      deleteShdwDriveFile(passImageUri),
      deleteShdwDriveFile(invitationImageUri),
      deleteShdwDriveFile(shdwHash),
      deleteShdwDriveFile(shdwHashInvite),
    ]);
    return {
      type: "error",
      message:
        "We’re sorry. An error occurred while trying to deploy your community and mint your assets. Please check your wallet and try again.",
    };
  }
}
