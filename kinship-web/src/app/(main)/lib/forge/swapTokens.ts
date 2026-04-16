import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";

import { Connectivity as UserConn } from "@/anchor/user";
import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { web3Consts } from "@/anchor/web3Consts";
import { MintResultMessage } from "@/app/(main)/models/mintResultMessage";
import axios from "axios";
import { CoinDirectoryItem } from "@/app/(main)/models/coinDirectoryItem";
import { SwapCoin } from "@/app/(main)/models/swapCoin";
import { list } from "firebase/storage";
import { getPriceForPTV } from "./jupiter";
import { CoinDetail } from "@/app/(main)/models/coin";
import { FrostWallet } from "@/utils/frostWallet";
import internalClient from "../internalHttpClient";
import { ConnectionContextState } from "@/utils/connection";

export const swapTokens = async (
  baseToken: SwapCoin,
  targetToken: SwapCoin,
  wallet: FrostWallet,
  connect:ConnectionContextState
): Promise<MintResultMessage> => {
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
    confirmTransactionInitialTimeout: 120000,
  });

  const env = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "processed",
  });

  let memecoin = baseToken.is_memecoin ? baseToken : targetToken;

  const result = await axios.get<CoinDetail>(
    `/api/get-token-by-symbol?symbol=${memecoin.symbol}`,
  );

  console.log("CoinDetail", result.data);

  anchor.setProvider(env);
  const curveConn: CurveConn = new CurveConn(env, web3Consts.programID);
  const userConn: UserConn = new UserConn(env, web3Consts.programID);
  const tokenBondingAcct = await curveConn.getTokenBonding(
    new anchor.web3.PublicKey(result.data.bonding),
  );
  const genesisUser = await userConn.getGensisProfileOwner();
  const ownerUser = await userConn.getNftProfileOwner(
    tokenBondingAcct!.targetMint,
  );

  const creatorInfo = await axios.get(
    `/api/get-wallet-data?wallet=${ownerUser.profileHolder.toBase58()}`,
  );

  console.log("creatorInfo ", creatorInfo);
  let hasProfile = false;
  if (creatorInfo.data) {
    if (creatorInfo.data.wallet) {
      hasProfile = true;
    }
  }
  let projectToken = await axios.get(
    `/api/project/token-detail?symbol=` + memecoin.symbol,
  );

  let listResult = await axios.get(
    `/api/project/detail?address=` + projectToken.data.projectkey,
  );
  const genesisPassUser = await userConn.getNftProfileOwner(
    new anchor.web3.PublicKey(listResult.data.project.key),
  );

  // if (hasProfile) {
  //   let creatorShare: any;
  //   if (targetToken.symbol.toLowerCase() == "sol") {
  //     console.log("ownerUser ", ownerUser.profileHolder.toBase58());
  //     creatorShare = anchor.web3.SystemProgram.transfer({
  //       fromPubkey: wallet.publicKey,
  //       toPubkey: ownerUser.profileHolder,
  //       lamports: Math.ceil(
  //         targetToken.value * 0.03 * 10 ** targetToken.decimals,
  //       ),
  //     });
  //   } else {
  //     creatorShare = await userConn.baseSpl.transfer_token_modified({
  //       mint: new anchor.web3.PublicKey(targetToken.token),
  //       sender: wallet.publicKey,
  //       receiver: ownerUser.profileHolder,
  //       init_if_needed: true,
  //       amount: Math.ceil(
  //         targetToken.value * 0.03 * 10 ** targetToken.decimals,
  //       ),
  //     });
  //   }

  //   let gensisPassShare: any;
  //   if (targetToken.symbol.toLowerCase() == "sol") {
  //     console.log("genesisPassUser ", genesisPassUser.profileHolder.toBase58());
  //     gensisPassShare = anchor.web3.SystemProgram.transfer({
  //       fromPubkey: wallet.publicKey,
  //       toPubkey: genesisPassUser.profileHolder,
  //       lamports: Math.ceil(
  //         targetToken.value * 0.02 * 10 ** targetToken.decimals,
  //       ),
  //     });
  //   } else {
  //     gensisPassShare = await userConn.baseSpl.transfer_token_modified({
  //       mint: new anchor.web3.PublicKey(targetToken.token),
  //       sender: wallet.publicKey,
  //       receiver: genesisPassUser.profileHolder,
  //       init_if_needed: true,
  //       amount: Math.ceil(
  //         targetToken.value * 0.02 * 10 ** targetToken.decimals,
  //       ),
  //     });
  //   }

  //   for (let index = 0; index < creatorShare.length; index++) {
  //     curveConn.txis.push(creatorShare[index]);
  //   }

  //   for (let index = 0; index < gensisPassShare.length; index++) {
  //     curveConn.txis.push(gensisPassShare[index]);
  //   }
  // } else {
  //   let creatorShare: any;
  //   if (targetToken.symbol.toLowerCase() == "sol") {
  //     console.log("ownerUser ", ownerUser.profileHolder.toBase58());
  //     creatorShare = anchor.web3.SystemProgram.transfer({
  //       fromPubkey: wallet.publicKey,
  //       toPubkey: ownerUser.profileHolder,
  //       lamports: Math.ceil(
  //         targetToken.value * 0.02 * 10 ** targetToken.decimals,
  //       ),
  //     });
  //   } else {
  //     creatorShare = await userConn.baseSpl.transfer_token_modified({
  //       mint: new anchor.web3.PublicKey(targetToken.token),
  //       sender: wallet.publicKey,
  //       receiver: ownerUser.profileHolder,
  //       init_if_needed: true,
  //       amount: Math.ceil(
  //         targetToken.value * 0.02 * 10 ** targetToken.decimals,
  //       ),
  //     });
  //   }
  //   let gensisPassShare: any;
  //   if (targetToken.symbol.toLowerCase() == "sol") {
  //     console.log("genesisPassUser ", genesisPassUser.profileHolder.toBase58());
  //     gensisPassShare = anchor.web3.SystemProgram.transfer({
  //       fromPubkey: wallet.publicKey,
  //       toPubkey: genesisPassUser.profileHolder,
  //       lamports: Math.ceil(
  //         targetToken.value * 0.03 * 10 ** targetToken.decimals,
  //       ),
  //     });
  //   } else {
  //     gensisPassShare = await userConn.baseSpl.transfer_token_modified({
  //       mint: new anchor.web3.PublicKey(targetToken.token),
  //       sender: wallet.publicKey,
  //       receiver: genesisPassUser.profileHolder,
  //       init_if_needed: true,
  //       amount: Math.ceil(
  //         targetToken.value * 0.03 * 10 ** targetToken.decimals,
  //       ),
  //     });
  //   }

  //   for (let index = 0; index < gensisPassShare.length; index++) {
  //     curveConn.txis.push(gensisPassShare[index]);
  //   }

  //   for (let index = 0; index < creatorShare.length; index++) {
  //     curveConn.txis.push(creatorShare[index]);
  //   }
  // }

  let genesisShare: any;
  if (targetToken.symbol.toLowerCase() == "sol") {
    genesisShare = anchor.web3.SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: genesisUser.profileHolder,
      lamports: Math.ceil(
        targetToken.value * 0.01 * 10 ** targetToken.decimals,
      ),
    });
  } else {
    genesisShare = await userConn.baseSpl.transfer_token_modified({
      mint: new anchor.web3.PublicKey(targetToken.token),
      sender: wallet.publicKey,
      receiver: genesisUser.profileHolder,
      init_if_needed: true,
      amount: Math.ceil(targetToken.value * 0.01 * 10 ** targetToken.decimals),
    });
  }

  for (let index = 0; index < genesisShare.length; index++) {
    curveConn.txis.push(genesisShare[index]);
  }

  try {
    let tx;
    let buyres;
    const isMMOSHBase = !targetToken.is_memecoin;

    if (isMMOSHBase) {
      let userConn: UserConn = new UserConn(env, web3Consts.programID);

      let balance = 0;
      if (targetToken.symbol.toLowerCase() === "sol") {
        const infoes = await userConn.connection.getMultipleAccountsInfo([
          new anchor.web3.PublicKey(userConn.provider.publicKey.toBase58()),
        ]);
        if (infoes[0]) {
          balance = infoes[0].lamports / 1000_000_000;
        }
      } else {
        balance = await userConn.getUserBalance({
          address: wallet.publicKey,
          token: targetToken.token,
          decimals: targetToken.decimals,
        });
      }

      console.log("balance is ", balance);
      console.log("desired amount ", baseToken.value);

      if (balance > targetToken.value) {
        console.log('-----------------------------inside the buy---------------------------------------')
        buyres = await curveConn.buy({
          tokenBonding: new anchor.web3.PublicKey(result.data.bonding),
          desiredTargetAmount: new anchor.BN(
            baseToken.value * 10 ** baseToken.decimals,
          ),
          slippage: 0.5,
        },connect);
      } else {
        return {
          message:
            "We’re sorry, there was an error while trying to mint. Check your wallet and try again.",
          type: "error",
        };
      }
      console.log("buyres ", buyres);
      tx = buyres;
    } else {
      let supply = Math.ceil(targetToken.value - targetToken.value * 0.06);
      let sellres = await curveConn.sell({
        tokenBonding: new anchor.web3.PublicKey(result.data.bonding),
        targetAmount: new anchor.BN(supply * 10 ** targetToken.decimals),
        slippage: 0.5,
      });
      tx = sellres;
    }

    let params;
    if (!targetToken.is_memecoin) {
      params = {
        basekey: targetToken.token,
        basename: targetToken.name,
        basesymbol: targetToken.symbol,
        baseimg: targetToken.image,
        bonding: result.data.bonding,
        targetkey: baseToken.token,
        targetname: baseToken.name,
        targetsymbol: baseToken.symbol,
        targetimg: baseToken.image,
        value: targetToken.value - targetToken.value * 0.06,
        price: baseToken.value / (targetToken.value - targetToken.value * 0.06),
        type: "buy",
        wallet: wallet.publicKey.toBase58(),
        tx,
      };
    } else {
      params = {
        basekey: baseToken.token,
        basename: baseToken.name,
        basesymbol: baseToken.symbol,
        baseimg: baseToken.image,
        bonding: result.data.bonding,
        targetkey: targetToken.token,
        targetname: targetToken.name,
        targetsymbol: targetToken.symbol,
        targetimg: targetToken.image,
        value: baseToken.value,
        price: (targetToken.value - targetToken.value * 0.06) / baseToken.value,
        type: "sell",
        wallet: wallet.publicKey.toBase58(),
        tx,
      };
    }

    let creator =
      wallet.publicKey.toBase58().substring(0, 5) +
      "..." +
      wallet.publicKey
        .toBase58()
        .substring(wallet.publicKey.toBase58().length - 5);
    if (hasProfile) {
      if (creatorInfo.data.telegram) {
        creator = "@" + creatorInfo.data.telegram.username;
      } else {
        if (creatorInfo.data.profile) {
          creator = creatorInfo.data.profile.username;
        }
      }
    }

    let supply = 0;
    if (tokenBondingAcct) {
      supply =
        tokenBondingAcct.supplyFromBonding.toNumber() /
        10 **
        (!targetToken.is_memecoin
          ? targetToken.decimals
          : baseToken.decimals);
    }

    await sendTelegramNotification(params, creator, supply);
    await saveDirectory(params);

    await tryCurveUpgrade(result.data);

    await userConn.storeRoyalty(
      wallet.publicKey.toBase58(),
      [
        {
          receiver: ownerUser.profileHolder.toBase58(),
          amount: targetToken.value * 0.03,
        },
        {
          receiver: genesisUser.profileHolder.toBase58(),
          amount: targetToken.value * 0.03,
        },
      ],
      targetToken.token,
    );

    const returningToken =
      targetToken.token !== web3Consts.oposToken.toBase58()
        ? targetToken
        : baseToken;

    return {
      message: "Congrats! Your token have been swapped successfully",
      type: "success",
      data: {
        token: returningToken,
      },
    };
  } catch (error) {
    console.error(error);
    return {
      message:
        "There was an error while swapping your tokens. Please, try again.",
      type: "error",
    };
  }
};

const saveDirectory = async (params: CoinDirectoryItem) => {
  await internalClient.post("/api/save-directory", params);
};

const tryCurveUpgrade = async (detail: CoinDetail) => {
  await internalClient.get("/api/curve-upgrade?bonding=" + detail.bonding);
};

const sendTelegramNotification = async (
  params: CoinDirectoryItem,
  creator: any,
  supply: any,
) => {
  try {
    let usdcPrice;

    const result = await axios.get(
      `/api/get-group-community?symbol=${params.basesymbol}`,
    );

    if (!result.data) {
      return;
    }
    console.log("community details ", result.data);
    let groupID = result.data.group[0].handle;

    if (params.basesymbol === "PTVB") {
      let result = await getPriceForPTV(process.env.NEXT_PUBLIC_PTVB_TOKEN);
      usdcPrice = result > 0 ? result : 0.0003;
    } else if (params.basesymbol === "PTVR") {
      let result = await getPriceForPTV(process.env.NEXT_PUBLIC_PTVR_TOKEN);
      usdcPrice = result > 0 ? result : 0.0003;
    } else {
      let apiResponse = await axios.get(
        `${process.env.NEXT_PUBLIC_JUPITER_PRICE_API}?ids=${process.env.NEXT_PUBLIC_OPOS_TOKEN},${process.env.NEXT_PUBLIC_USDC_TOKEN}`,
      );
      usdcPrice = apiResponse.data?.data?.MMOSH?.price || 0;
    }

    let communityCoinPrice = params.value / (params.value * params.price);

    const botToken = process.env.NEXT_PUBLIC_BOT_TOKEN;

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    let swapType = params.type === "sell" ? "Sold!" : "Bought!";
    let swapTypeSymbol = params.type === "sell" ? "-" : "+";
    let swapMessage =
      params.type === "sell"
        ? creator + " reduced their position"
        : "Thank you " + creator + " for Pumping the Vote!";

    let text = params.targetname + " " + swapType + "\n";
    text =
      text +
      params.value * params.price +
      " " +
      params.targetsymbol.toUpperCase() +
      " " +
      swapTypeSymbol +
      "\n";
    text = text + params.value + " " + params.basesymbol.toUpperCase() + "\n";
    text = text + params.value * usdcPrice + " USDC\n";
    text =
      text +
      "Fully Diluted Value " +
      (supply + params.value * params.price) * communityCoinPrice * usdcPrice +
      " USDC\n";
    text = text + swapMessage + " \n";
    const response = await axios.post(telegramUrl, {
      chat_id: groupID,
      text: text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Swap", url: "https://www.kinship.systems/swap" },
            {
              text: "View",
              url: "https://www.kinship.systems/coins/" + params.targetsymbol,
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.log("sendTelegramNotification err ", error);
  }
};
