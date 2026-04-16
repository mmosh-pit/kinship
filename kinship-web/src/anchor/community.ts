import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { IDL, Mmoshforge } from "./mmoshforge";
import {
  LineageInfo,
  MainStateInput,
  MintProfileByAdminInput,
  MintingCostDistribution,
  Result,
  TxPassType,
  TransactionPassType,
  _MintGensisInput,
  _MintGuestPass,
  _MintProfileByAtInput,
  _MintProfileInput,
  _MintSubscriptionToken,
  _RegisterCommonLut,
} from "./web3Types";
import Config from "./web3Config.json";
import { BaseMpl } from "./base/baseMpl";
import { web3Consts } from "./web3Consts";
import {
  AuthorityType,
  MINT_SIZE,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptAccount,
  mintTo,
  unpackAccount,
} from "forge-spl-token";
import {
  Metaplex,
  Metadata as MetadataM,
  token,
} from "@metaplex-foundation/js";
import { BaseSpl, UpdateToken } from "./base/baseSpl";
import axios from "axios";

import {
  PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
} from "@metaplex-foundation/mpl-token-metadata";
import { createMintInstructions } from "@strata-foundation/spl-utils";
import internalClient from "@/app/(main)/lib/internalHttpClient";

import {
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Token } from "./curve/spl-token-curve/index";
import { getLineage } from "@/app/(main)/lib/forge/createProfile";
import { ConnectionContextState } from "@/utils/connection";
import { FrostWallet } from "@/utils/frostWallet";

const {
  systemProgram,
  associatedTokenProgram,
  mplProgram,
  tokenProgram,
  sysvarInstructions,
  Seeds,
  oposToken,
  LAMPORTS_PER_OPOS,
  addressLookupTableProgram,
} = web3Consts;
const log = console.log;

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Connectivity {
  programId: web3.PublicKey;
  provider: AnchorProvider;
  txis: web3.TransactionInstruction[] = [];
  extraSigns: web3.Keypair[] = [];
  multiSignInfo: any[] = [];
  program: Program<Mmoshforge>;
  mainState: web3.PublicKey;
  projectId: web3.PublicKey;
  connection: web3.Connection;
  metaplex: Metaplex;
  baseSpl: BaseSpl;

  constructor(
    provider: AnchorProvider,
    programId: web3.PublicKey,
    projectId: web3.PublicKey
  ) {
    this.provider = provider;
    this.connection = provider.connection;
    this.programId = programId;
    this.program = new Program(IDL, this.provider);
    this.metaplex = new Metaplex(this.connection);
    this.baseSpl = new BaseSpl(this.connection);
    this.projectId = projectId;
    this.mainState = web3.PublicKey.findProgramAddressSync(
      [Seeds.mainState, projectId.toBuffer()],
      this.programId
    )[0];
  }

  setMainState() {
    console.log("main state assign");
    this.mainState = web3.PublicKey.findProgramAddressSync(
      [Seeds.mainState, this.projectId.toBuffer()],
      this.programId
    )[0];
    console.log("main state assign ", this.mainState.toBase58());
  }

  reinit() {
    this.txis = [];
    this.extraSigns = [];
    this.multiSignInfo = [];
  }

  ixCallBack = (ixs?: web3.TransactionInstruction[]) => {
    if (ixs) {
      this.txis.push(...ixs);
    }
  };

  __getProfileStateAccount(mint: web3.PublicKey | string): web3.PublicKey {
    if (typeof mint == "string") mint = new web3.PublicKey(mint);
    return web3.PublicKey.findProgramAddressSync(
      [Seeds.profileState, mint.toBuffer()],
      this.programId
    )[0];
  }

  __getCollectionStateAccount(mint: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Seeds.collectionState, mint.toBuffer()],
      this.programId
    )[0];
  }

  __getActivationTokenStateAccount(mint: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Seeds.activationTokenState, mint.toBuffer()],
      this.programId
    )[0];
  }

  __getValutAccount(
    mint: web3.PublicKey,
    profile: web3.PublicKey
  ): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Seeds.vault, mint.toBuffer(), profile.toBuffer()],
      this.programId
    )[0];
  }

  async sendProjectPrice(
    profile: any,
    amount: any,
    connection: ConnectionContextState
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    for (let attempt = 0; attempt < web3Consts.MAX_RETRIES; attempt++) {
      try {
        const user = this.provider.publicKey;

        const rootMainState = web3.PublicKey.findProgramAddressSync(
          [Seeds.mainState],
          this.programId
        )[0];

        let lineage = await getLineage(profile);

        console.log("lineage from the send project price ", lineage);
        const rootMainStateInfo =
          await this.program.account.mainState.fetch(rootMainState);

        let cost = amount * web3Consts.LAMPORTS_PER_OPOS;

        console.log("cost from the send project price ", cost);

        let holdersfullInfo = [];

        holdersfullInfo.push({
          receiver: lineage.gensis,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.genesis / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: lineage.parent,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.parent / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: lineage.gparent,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: lineage.ggparent,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.greatGrandParent /
              100 /
              100),
        });

        holdersfullInfo.push({
          receiver: lineage.gggparent,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.ggreatGrandParent /
              100 /
              100),
        });

        console.log(
          "holdersfullInfo from the send project price ",
          holdersfullInfo
        );
        var holdermap: any = [];
        holdersfullInfo.reduce(function (res: any, value: any) {
          if (!res[value.receiver]) {
            res[value.receiver] = { receiver: value.receiver, vallue: 0 };
            holdermap.push(res[value.receiver]);
          }
          res[value.receiver].vallue += value.vallue;
          return res;
        }, {});

        console.log("holdermap from the send project price ", holdermap);
        for (let index = 0; index < holdermap.length; index++) {
          const element = holdermap[index];
          let createShare: any = await this.baseSpl.transfer_token_modified({
            mint: rootMainStateInfo.oposToken,
            sender: user,
            receiver: new anchor.web3.PublicKey(element.receiver),
            init_if_needed: true,
            amount: Math.ceil(element.vallue),
          });
          for (let index = 0; index < createShare.length; index++) {
            this.txis.push(createShare[index]);
          }
        }

        console.log("send project price 1 ");

        const tx = new web3.Transaction().add(...this.txis);

        console.log(tx, "transaction before send =========================>");

        tx.recentBlockhash = (
          await this.connection.getLatestBlockhash()
        ).blockhash;
        tx.feePayer = new anchor.web3.PublicKey(
          process.env.NEXT_PUBLIC_PTV_WALLET_KEY || ""
        );
        console.log("---------------------step 1----------------");
        const feeEstimate = await this.getPriorityFeeEstimate(tx);
        let feeIns;
        if (feeEstimate > 0) {
          console.log("---------------------step 2----------------");

          feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: feeEstimate,
          });
        } else {
          console.log("---------------------step 3----------------");

          feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_400_000,
          });
        }
        tx.add(feeIns);
        console.log("---------------------step 4----------------");

        this.txis = [];

        const signedTx = await this.provider.wallet.signTransaction(tx as any);
        const signature = await connection.sendAndConfirm(
          signedTx as any,
          this.provider.wallet.publicKey.toBase58()
        );

        // const signature = await this.provider.sendAndConfirm(tx);

        console.log(signature, "signature =========================>");
        console.log("---------------------step 5----------------");

        let storeRoyalty = await this.storeRoyalty(
          user.toBase58(),
          [
            {
              receiver: lineage.gensis,
              amount:
                amount *
                (rootMainStateInfo.mintingCostDistribution.genesis / 100 / 100),
            },
            {
              receiver: lineage.parent,
              amount:
                amount *
                (rootMainStateInfo.mintingCostDistribution.parent / 100 / 100),
            },
            {
              receiver: lineage.gparent,
              amount:
                amount *
                (rootMainStateInfo.mintingCostDistribution.grandParent /
                  100 /
                  100),
            },
            {
              receiver: lineage.ggparent,
              amount:
                amount *
                (rootMainStateInfo.mintingCostDistribution.ggreatGrandParent /
                  100 /
                  100),
            },
          ],

          web3Consts.oposToken
        );
        console.log(
          storeRoyalty,
          "---------------------step 6----------------"
        );

        return {
          Ok: {
            signature,
            info: { profile: profile },
          },
        };
      } catch (error: any) {
        log({ error: error });
        const isRetryable =
          error.message?.includes("blockhash not found") ||
          error.message?.includes("timeout") ||
          error.message?.includes("rate limit") ||
          error.message?.includes("too many requests");

        if (!isRetryable || attempt === web3Consts.MAX_RETRIES - 1) {
          return { Err: error };
        }
        const backoff =
          web3Consts.INITIAL_BACKOFF *
          Math.pow(2, attempt) *
          (0.5 + Math.random());
        await sleep(backoff);
      }
    }
    return { Err: "Unreachable" };
  }

  async sendOfferPrice(
    profile: any,
    amount: any,
    connect: ConnectionContextState
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    for (let attempt = 0; attempt < web3Consts.MAX_RETRIES; attempt++) {
      try {
        const user = this.provider.publicKey;

        const rootMainState = web3.PublicKey.findProgramAddressSync(
          [Seeds.mainState],
          this.programId
        )[0];

        let lineage = await getLineage(profile);

        console.log("lineage from the send project price ", lineage);
        const rootMainStateInfo =
          await this.program.account.mainState.fetch(rootMainState);

        let cost = amount * web3Consts.LAMPORTS_PER_OPOS;

        console.log("cost from the send project price ", cost);

        let holdersfullInfo = [];

        holdersfullInfo.push({
          receiver: lineage.gensis,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.genesis / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: lineage.parent,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.parent / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: lineage.gparent,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: lineage.ggparent,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.greatGrandParent /
              100 /
              100),
        });

        holdersfullInfo.push({
          receiver: lineage.gggparent,
          vallue:
            cost *
            (rootMainStateInfo.mintingCostDistribution.ggreatGrandParent /
              100 /
              100),
        });

        console.log(
          "holdersfullInfo from the send project price ",
          holdersfullInfo
        );
        var holdermap: any = [];
        holdersfullInfo.reduce(function (res: any, value: any) {
          if (!res[value.receiver]) {
            res[value.receiver] = { receiver: value.receiver, vallue: 0 };
            holdermap.push(res[value.receiver]);
          }
          res[value.receiver].vallue += value.vallue;
          return res;
        }, {});

        console.log("holdermap from the send project price ", holdermap);
        for (let index = 0; index < holdermap.length; index++) {
          const element = holdermap[index];
          let createShare: any = await this.baseSpl.transfer_token_modified({
            mint: rootMainStateInfo.oposToken,
            sender: user,
            receiver: new anchor.web3.PublicKey(element.receiver),
            init_if_needed: true,
            amount: Math.ceil(element.vallue),
          });
          for (let index = 0; index < createShare.length; index++) {
            this.txis.push(createShare[index]);
          }
        }

        console.log("send project price 1 ");

        const tx = new web3.Transaction().add(...this.txis);

        console.log(tx, "transaction before send =========================>");

        tx.recentBlockhash = (
          await this.connection.getLatestBlockhash()
        ).blockhash;
        tx.feePayer = new anchor.web3.PublicKey(
          process.env.NEXT_PUBLIC_PTV_WALLET_KEY || ""
        );
        console.log("---------------------step 1----------------");
        const feeEstimate = await this.getPriorityFeeEstimate(tx);
        let feeIns;
        if (feeEstimate > 0) {
          console.log("---------------------step 2----------------");

          feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: feeEstimate,
          });
        } else {
          console.log("---------------------step 3----------------");

          feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_400_000,
          });
        }
        tx.add(feeIns);
        console.log("---------------------step 4----------------");

        console.log(tx.feePayer,"tx.feePayer  admin wallet addres =======================>>");
        console.log(
          this.provider.wallet.publicKey.toBase58(),
          "user wallet addres ==========================>"
        );
        this.txis = [];
        const signedTx = await this.provider.wallet.signTransaction(tx as any);
        console.log(signedTx, "singtedtx ==============================>");
        const signature = await connect.sendAndConfirm(
          signedTx as any,
          this.provider.wallet.publicKey.toBase58()
        );
        // const signature = await this.provider.sendAndConfirm(tx);
        console.log(signature, "signature =========================>");
        console.log("---------------------step 5----------------");

        return {
          Ok: {
            signature,
            info: {
              profile: profile,
              sender: user.toBase58(),
              receivers: [
                {
                  receiver: lineage.gensis,
                  amount:
                    amount *
                    (rootMainStateInfo.mintingCostDistribution.genesis /
                      100 /
                      100),
                },
                {
                  receiver: lineage.parent,
                  amount:
                    amount *
                    (rootMainStateInfo.mintingCostDistribution.parent /
                      100 /
                      100),
                },
                {
                  receiver: lineage.gparent,
                  amount:
                    amount *
                    (rootMainStateInfo.mintingCostDistribution.grandParent /
                      100 /
                      100),
                },
                {
                  receiver: lineage.ggparent,
                  amount:
                    amount *
                    (rootMainStateInfo.mintingCostDistribution
                      .ggreatGrandParent /
                      100 /
                      100),
                },
              ],
              coin: web3Consts.oposToken,
            } as any,
          },
        };
      } catch (error: any) {
        log({ error: error });
        const isRetryable =
          error.message?.includes("blockhash not found") ||
          error.message?.includes("timeout") ||
          error.message?.includes("rate limit") ||
          error.message?.includes("too many requests");

        if (!isRetryable || attempt === web3Consts.MAX_RETRIES - 1) {
          return { Err: error };
        }
        const backoff =
          web3Consts.INITIAL_BACKOFF *
          Math.pow(2, attempt) *
          (0.5 + Math.random());
        await sleep(backoff);
      }
    }
    return { Err: "Unreachable" };
  }

  async setupLookupTable(
    addresses: web3.PublicKey[] = []
  ): Promise<Result<TxPassType<{ lookupTable: string }>, any>> {
    for (let attempt = 0; attempt < web3Consts.MAX_RETRIES; attempt++) {
      try {
        const slot = await this.connection.getSlot();
        const [lookupTableInst, lookupTableAddress] =
          web3.AddressLookupTableProgram.createLookupTable({
            authority: this.provider.publicKey,
            payer: this.provider.publicKey,
            recentSlot: slot - 1,
          });

        const extendInstruction =
          web3.AddressLookupTableProgram.extendLookupTable({
            payer: this.provider.publicKey,
            authority: this.provider.publicKey,
            lookupTable: lookupTableAddress,
            addresses,
          });
        const freezeInstruction =
          web3.AddressLookupTableProgram.freezeLookupTable({
            lookupTable: lookupTableAddress, // The address of the lookup table to freeze
            authority: this.provider.publicKey, // The authority (i.e., the account with permission to modify the lookup table)
          });

        const transaction = new web3.Transaction().add(
          lookupTableInst,
          extendInstruction,
          freezeInstruction
        );

        transaction.recentBlockhash = (
          await this.connection.getLatestBlockhash()
        ).blockhash;
        transaction.feePayer = this.provider.publicKey;

        const feeEstimate = await this.getPriorityFeeEstimate(transaction);
        let feeIns;
        if (feeEstimate > 0) {
          feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: feeEstimate,
          });
        } else {
          feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_400_000,
          });
        }
        transaction.add(feeIns);

        const signature = await this.provider.sendAndConfirm(
          transaction as any
        );
        return {
          Ok: {
            signature,
            info: { lookupTable: lookupTableAddress.toBase58() },
          },
        };
      } catch (error: any) {
        log({ error: error });
        const isRetryable =
          error.message?.includes("blockhash not found") ||
          error.message?.includes("timeout") ||
          error.message?.includes("rate limit") ||
          error.message?.includes("too many requests");

        if (!isRetryable || attempt === web3Consts.MAX_RETRIES - 1) {
          return { Err: error };
        }
        const backoff =
          web3Consts.INITIAL_BACKOFF *
          Math.pow(2, attempt) *
          (0.5 + Math.random());
        await sleep(backoff);
      }
    }
    return { Err: "Unreachable" };
  }

  async mintPass(
    input: _MintProfileByAtInput,
    userProfile: string
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    for (let attempt = 0; attempt < web3Consts.MAX_RETRIES; attempt++) {
      try {
        this.reinit();
        this.baseSpl.__reinit();
        const user = this.provider.publicKey;
        if (!user) throw "Wallet not found";
        let {
          name,
          symbol,
          uriHash,
          activationToken,
          genesisProfile,
          commonLut,
        } = input;
        if (typeof activationToken == "string")
          activationToken = new web3.PublicKey(activationToken);
        if (typeof genesisProfile == "string")
          genesisProfile = new web3.PublicKey(activationToken);

        console.log("mint pass 1");
        symbol = symbol ?? "";
        uriHash = uriHash ?? "";
        console.log("mint pass 2");
        const activationTokenState =
          this.__getActivationTokenStateAccount(activationToken);
        const activationTokenStateInfo =
          await this.program.account.activationTokenState.fetch(
            activationTokenState
          );
        console.log("mint pass 3");
        const parentProfile = activationTokenStateInfo.parentProfile;
        const parentProfileStateInfo =
          await this.program.account.profileState.fetch(
            this.__getProfileStateAccount(parentProfile)
          );
        console.log("mint pass 4");
        const lut = parentProfileStateInfo.lut;
        const parentProfileNftInfo = await this.metaplex
          .nfts()
          .findByMint({ mintAddress: parentProfile, loadJsonMetadata: false });
        console.log("mint pass 4");
        const collection = parentProfileNftInfo?.collection?.address;
        if (!collection) return { Err: "Collection info not found" };
        const collectionMetadata = BaseMpl.getMetadataAccount(collection);
        const collectionEdition = BaseMpl.getEditionAccount(collection);
        const mintKp = web3.Keypair.generate();
        const profile = mintKp.publicKey;

        const { ixs: mintIxs } =
          await this.baseSpl.__getCreateTokenInstructions({
            mintAuthority: user,
            mintKeypair: mintKp,
            mintingInfo: {
              tokenAmount: 1,
              tokenReceiver: user,
            },
          });

        const mintTx = new web3.Transaction().add(...mintIxs);

        mintTx.recentBlockhash = (
          await this.connection.getLatestBlockhash()
        ).blockhash;
        mintTx.feePayer = this.provider.publicKey;

        const feeEstimateMint = await this.getPriorityFeeEstimate(mintTx);
        let feeInsMint;
        if (feeEstimateMint > 0) {
          feeInsMint = web3.ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: feeEstimateMint,
          });
        } else {
          feeInsMint = web3.ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_400_000,
          });
        }
        mintTx.add(feeInsMint);

        this.txis = [];
        const mintsignature = await this.provider.sendAndConfirm(mintTx, [
          mintKp,
        ]);

        await sleep(5000);

        const userProfileAta = getAssociatedTokenAddressSync(profile, user);
        const { ata: userActivationTokenAta } =
          await this.baseSpl.__getOrCreateTokenAccountInstruction(
            { mint: activationToken, owner: user },
            this.ixCallBack
          );
        console.log("mint pass 6");
        const profileMetadata = BaseMpl.getMetadataAccount(profile);
        const profileEdition = BaseMpl.getEditionAccount(profile);
        const profileState = this.__getProfileStateAccount(profile);
        const parentProfileState = this.__getProfileStateAccount(parentProfile);
        const mainStateInfo = await this.program.account.mainState.fetch(
          this.mainState
        );
        console.log("mint pass 7");
        const {
          currentGenesisProfileHolder,
          currentGrandParentProfileHolder,
          currentParentProfileHolder,
          currentGenesisProfileHolderAta,
          parentProfileHolderOposAta,
          grandParentProfileHolderOposAta,
        } = await this.__getProfileHoldersInfo(
          parentProfileStateInfo.lineage,
          parentProfile,
          genesisProfile,
          mainStateInfo.oposToken
        );

        console.log("mint pass 8");
        const userOposAta = getAssociatedTokenAddressSync(
          mainStateInfo.oposToken,
          user
        );
        const parentMainState = web3.PublicKey.findProgramAddressSync(
          [Seeds.mainState],
          this.programId
        )[0];
        console.log("mint pass 9");
        const ix = await this.program.methods
          .mintPassByAt(name, symbol, uriHash)
          .accounts({
            profile, // 1
            project: this.projectId,
            user, // 2
            oposToken: mainStateInfo.oposToken, // 3
            userProfileAta, // 5
            mainState: this.mainState, // 6
            parentMainState,
            collection, // 7
            mplProgram, // 8
            profileState, // 9
            tokenProgram, // 10
            systemProgram, // 11
            profileEdition, // 12
            activationToken, // 13
            profileMetadata, // 14
            collectionEdition, // 15
            collectionMetadata, // 16
            parentProfileState, // 17
            sysvarInstructions, // 18
            userActivationTokenAta, // 19
            associatedTokenProgram, // 20
            parentProfile,
          })
          .instruction();
        this.txis.push(ix);

        let cost = mainStateInfo.profileMintingCost.toNumber();

        let profileHolderInfo;
        if (cost > 0) {
          console.log("mint pass 71", userProfile);
          console.log("mint pass 711", mainStateInfo.oposToken.toBase58());
          let myProfile = new anchor.web3.PublicKey(userProfile);
          const myProfileState = this.__getProfileStateAccount(myProfile);
          console.log("mint pass 72");
          let myProfileStateInfo =
            await this.program.account.profileState.fetch(myProfileState);
          console.log("mint pass 73");
          profileHolderInfo = await this.__getProfileHoldersInfo(
            myProfileStateInfo.lineage,
            myProfile,
            web3Consts.genesisProfile,
            mainStateInfo.oposToken
          );
          let holdersfullInfo = [];

          holdersfullInfo.push({
            receiver: profileHolderInfo.currentGenesisProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.genesis / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: profileHolderInfo.currentParentProfileHolder.toBase58(),
            vallue:
              cost * (mainStateInfo.mintingCostDistribution.parent / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: currentGenesisProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: currentParentProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.greatGrandParent /
                100 /
                100),
          });

          holdersfullInfo.push({
            receiver: currentGrandParentProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.ggreatGrandParent /
                100 /
                100),
          });

          var holdermap: any = [];
          holdersfullInfo.reduce(function (res: any, value: any) {
            if (!res[value.receiver]) {
              res[value.receiver] = { receiver: value.receiver, vallue: 0 };
              holdermap.push(res[value.receiver]);
            }
            res[value.receiver].vallue += value.vallue;
            return res;
          }, {});

          for (let index = 0; index < holdermap.length; index++) {
            const element = holdermap[index];
            let createShare: any = await this.baseSpl.transfer_token_modified({
              mint: mainStateInfo.oposToken,
              sender: user,
              receiver: new anchor.web3.PublicKey(element.receiver),
              init_if_needed: true,
              amount: Math.ceil(element.vallue),
            });
            for (let index = 0; index < createShare.length; index++) {
              this.txis.push(createShare[index]);
            }
          }
        }

        console.log("mint pass 10", commonLut);
        const commonLutInfo = await (
          await this.connection.getAddressLookupTable(
            new anchor.web3.PublicKey(commonLut)
          )
        ).value;
        console.log("mint pass 11");
        const lutsInfo: any = [commonLutInfo];

        const freezeInstructions = await this.calculatePriorityFee(
          ix,
          lutsInfo,
          mintKp
        );

        console.log("mint pass 12");
        for (let index = 0; index < freezeInstructions.length; index++) {
          const element = freezeInstructions[index];
          this.txis.push(element);
        }

        const blockhash = (await this.connection.getLatestBlockhash())
          .blockhash;
        const message = new web3.TransactionMessage({
          payerKey: this.provider.publicKey,
          recentBlockhash: blockhash,
          instructions: [...this.txis],
        }).compileToV0Message(lutsInfo);
        console.log("mint pass 13");
        const tx = new web3.VersionedTransaction(message);
        tx.sign([mintKp]);
        this.txis = [];
        console.log("mint pass 14");
        // const signedTx = await this.provider.wallet.signTransaction(tx as any);
        // const txLen = signedTx.serialize().length;
        // log({ txLen, luts: lutsInfo.length });

        const signature = await this.provider.sendAndConfirm(tx as any);

        if (cost > 0 && profileHolderInfo) {
          await this.storeRoyalty(
            user.toBase58(),
            [
              {
                receiver:
                  profileHolderInfo.currentGenesisProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.genesis / 10000),
              },
              {
                receiver:
                  profileHolderInfo.currentParentProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.parent / 10000),
              },
              {
                receiver: currentGenesisProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.grandParent / 10000),
              },
              {
                receiver: currentParentProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.greatGrandParent /
                    10000),
              },
              {
                receiver: currentGrandParentProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.ggreatGrandParent /
                    10000),
              },
            ],
            mainStateInfo.oposToken.toBase58()
          );
        }

        console.log("mint pass 15");
        return {
          Ok: {
            signature,
            info: { profile: profile.toBase58() },
          },
        };
      } catch (error: any) {
        log({ error: error });
        const isRetryable =
          error.message?.includes("blockhash not found") ||
          error.message?.includes("timeout") ||
          error.message?.includes("rate limit") ||
          error.message?.includes("too many requests");

        if (!isRetryable || attempt === web3Consts.MAX_RETRIES - 1) {
          return { Err: error };
        }
        const backoff =
          web3Consts.INITIAL_BACKOFF *
          Math.pow(2, attempt) *
          (0.5 + Math.random());
        await sleep(backoff);
      }
    }
    return { Err: "Unreachable" };
  }

  async mintGuestPass(
    input: _MintGuestPass,
    userProfile: string
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    for (let attempt = 0; attempt < web3Consts.MAX_RETRIES; attempt++) {
      try {
        this.reinit();
        this.baseSpl.__reinit();
        const user = this.provider.publicKey;
        if (!user) throw "Wallet not found";
        let { name, symbol, uriHash, genesisProfile, commonLut } = input;

        if (typeof genesisProfile == "string")
          genesisProfile = new web3.PublicKey(genesisProfile);

        console.log("mint pass 1");
        symbol = symbol ?? "";
        uriHash = uriHash ?? "";
        console.log("mint pass 2");

        console.log("mint pass 3");
        const parentProfileStateInfo =
          await this.program.account.profileState.fetch(
            this.__getProfileStateAccount(genesisProfile)
          );
        console.log("mint pass 4");
        const lut = parentProfileStateInfo.lut;
        const parentProfileNftInfo = await this.metaplex
          .nfts()
          .findByMint({ mintAddress: genesisProfile, loadJsonMetadata: false });
        console.log("mint pass 4");
        const collection = parentProfileNftInfo?.collection?.address;
        if (!collection) return { Err: "Collection info not found" };
        const collectionMetadata = BaseMpl.getMetadataAccount(collection);
        const collectionEdition = BaseMpl.getEditionAccount(collection);
        const mintKp = web3.Keypair.generate();
        const profile = mintKp.publicKey;

        const { ixs: mintIxs } =
          await this.baseSpl.__getCreateTokenInstructions({
            mintAuthority: user,
            mintKeypair: mintKp,
            mintingInfo: {
              tokenAmount: 1,
              tokenReceiver: user,
            },
          });

        const mintTx = new web3.Transaction().add(...mintIxs);

        this.txis = [];

        for (let index = 0; index < mintIxs.length; index++) {
          const element = mintIxs[index];
          this.txis.push(element);
        }

        const userProfileAta = getAssociatedTokenAddressSync(profile, user);

        const profileMetadata = BaseMpl.getMetadataAccount(profile);
        const profileEdition = BaseMpl.getEditionAccount(profile);
        const profileState = this.__getProfileStateAccount(profile);
        const parentProfileState =
          this.__getProfileStateAccount(genesisProfile);
        const mainStateInfo = await this.program.account.mainState.fetch(
          this.mainState
        );
        console.log("mint pass 7");
        const {
          currentGenesisProfileHolder,
          currentGrandParentProfileHolder,
          currentParentProfileHolder,
        } = await this.__getProfileHoldersInfo(
          parentProfileStateInfo.lineage,
          genesisProfile,
          genesisProfile,
          mainStateInfo.oposToken
        );

        console.log("mint pass 74");

        console.log("mint pass 8");
        const userOposAta = getAssociatedTokenAddressSync(
          mainStateInfo.oposToken,
          user
        );
        const parentMainState = web3.PublicKey.findProgramAddressSync(
          [Seeds.mainState],
          this.programId
        )[0];
        console.log("mint pass 9");
        const ix = await this.program.methods
          .mintGuestPass(name, symbol, uriHash)
          .accounts({
            profile, // 1
            project: this.projectId,
            user, // 2
            userProfileAta, // 5
            mainState: this.mainState, // 6
            parentMainState,
            collection, // 7
            mplProgram, // 8
            profileState, // 9
            tokenProgram, // 10
            systemProgram, // 11
            profileEdition, // 12
            profileMetadata, // 14
            collectionEdition, // 15
            collectionMetadata, // 16
            parentProfileState, // 17
            sysvarInstructions, // 18
            associatedTokenProgram, // 20
            parentProfile: genesisProfile,
          })
          .instruction();
        this.txis.push(ix);

        let cost = mainStateInfo.profileMintingCost.toNumber();

        console.log(
          "mainStateInfo.oposToken ",
          mainStateInfo.oposToken.toBase58()
        );
        console.log("mainStateInfo.profileMintingCost ", cost);
        let profileHolderInfo;
        if (cost > 0) {
          console.log("mint pass 71", userProfile);
          console.log("mint pass 711", mainStateInfo.oposToken.toBase58());
          let myProfile = new anchor.web3.PublicKey(userProfile);
          const myProfileState = this.__getProfileStateAccount(myProfile);
          console.log("mint pass 72");
          let myProfileStateInfo =
            await this.program.account.profileState.fetch(myProfileState);
          console.log("mint pass 73");
          profileHolderInfo = await this.__getProfileHoldersInfo(
            myProfileStateInfo.lineage,
            myProfile,
            web3Consts.genesisProfile,
            mainStateInfo.oposToken
          );

          let holdersfullInfo = [];

          holdersfullInfo.push({
            receiver: profileHolderInfo.currentGenesisProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.genesis / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: profileHolderInfo.currentParentProfileHolder.toBase58(),
            vallue:
              cost * (mainStateInfo.mintingCostDistribution.parent / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: currentGenesisProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: currentParentProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.greatGrandParent /
                100 /
                100),
          });

          holdersfullInfo.push({
            receiver: currentGrandParentProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.ggreatGrandParent /
                100 /
                100),
          });

          const holdermap: any = [];
          holdersfullInfo.reduce(function (res: any, value) {
            if (!res[value.receiver]) {
              res[value.receiver] = { receiver: value.receiver, vallue: 0 };
              holdermap.push(res[value.receiver]);
            }
            res[value.receiver].vallue += value.vallue;
            return res;
          }, {});

          for (let index = 0; index < holdermap.length; index++) {
            const element = holdermap[index];
            let createShare: any = await this.baseSpl.transfer_token_modified({
              mint: mainStateInfo.oposToken,
              sender: user,
              receiver: new anchor.web3.PublicKey(element.receiver),
              init_if_needed: true,
              amount: Math.ceil(element.vallue),
            });
            for (let index = 0; index < createShare.length; index++) {
              this.txis.push(createShare[index]);
            }
          }
        }

        console.log("mint pass 10", commonLut);
        const commonLutInfo = await (
          await this.connection.getAddressLookupTable(
            new anchor.web3.PublicKey(commonLut)
          )
        ).value;
        console.log("mint pass 11");
        const lutsInfo = [commonLutInfo!];

        const freezeInstructions = await this.calculatePriorityFee(
          ix,
          lutsInfo,
          mintKp
        );

        console.log("mint pass 12");
        for (let index = 0; index < freezeInstructions.length; index++) {
          const element = freezeInstructions[index];
          this.txis.push(element);
        }

        const blockhash = (await this.connection.getLatestBlockhash())
          .blockhash;
        const message = new web3.TransactionMessage({
          payerKey: this.provider.publicKey,
          recentBlockhash: blockhash,
          instructions: [...this.txis],
        }).compileToV0Message(lutsInfo);
        console.log("mint pass 13");
        const tx = new web3.VersionedTransaction(message);
        tx.sign([mintKp]);
        this.txis = [];
        console.log("mint pass 14");
        // const signedTx = await this.provider.wallet.signTransaction(tx as any);
        // const txLen = signedTx.serialize().length;
        // log({ txLen, luts: lutsInfo.length });

        const signature = await this.provider.sendAndConfirm(tx as any);
        if (cost > 0 && profileHolderInfo) {
          await this.storeRoyalty(
            user.toBase58(),
            [
              {
                receiver:
                  profileHolderInfo.currentGenesisProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.genesis / 10000),
              },
              {
                receiver:
                  profileHolderInfo.currentParentProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.parent / 10000),
              },
              {
                receiver: currentGenesisProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.grandParent / 10000),
              },
              {
                receiver: currentParentProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.greatGrandParent /
                    10000),
              },
              {
                receiver: currentGrandParentProfileHolder.toBase58(),
                amount:
                  (mainStateInfo.profileMintingCost.toNumber() /
                    web3Consts.LAMPORTS_PER_OPOS) *
                  (mainStateInfo.mintingCostDistribution.ggreatGrandParent /
                    10000),
              },
            ],
            mainStateInfo.oposToken.toBase58()
          );
        }

        console.log("mint pass 15");
        return {
          Ok: {
            signature,
            info: { profile: profile.toBase58() },
          },
        };
      } catch (error: any) {
        log({ error: error });
        const isRetryable =
          error.message?.includes("blockhash not found") ||
          error.message?.includes("timeout") ||
          error.message?.includes("rate limit") ||
          error.message?.includes("too many requests");

        if (!isRetryable || attempt === web3Consts.MAX_RETRIES - 1) {
          return { Err: error };
        }
        const backoff =
          web3Consts.INITIAL_BACKOFF *
          Math.pow(2, attempt) *
          (0.5 + Math.random());
        await sleep(backoff);
      }
    }
    return { Err: "Unreachable" };
  }

  async mintFreePass(
    input: _MintGuestPass,
    receiver: string
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found";
      if (!receiver) throw "Wallet not found";

      let receiverProfile = new web3.PublicKey(receiver);
      let { name, symbol, uriHash, genesisProfile, commonLut } = input;

      if (typeof genesisProfile == "string")
        genesisProfile = new web3.PublicKey(genesisProfile);

      console.log("mint pass 1");
      symbol = symbol ?? "";
      uriHash = uriHash ?? "";
      console.log("mint pass 2");

      console.log("mint pass 3");
      const parentProfileStateInfo =
        await this.program.account.profileState.fetch(
          this.__getProfileStateAccount(genesisProfile)
        );
      console.log("mint pass 4");
      const lut = parentProfileStateInfo.lut;
      const parentProfileNftInfo = await this.metaplex
        .nfts()
        .findByMint({ mintAddress: genesisProfile, loadJsonMetadata: false });
      console.log("mint pass 4");
      const collection = parentProfileNftInfo?.collection?.address;
      if (!collection) return { Err: "Collection info not found" };
      const collectionMetadata = BaseMpl.getMetadataAccount(collection);
      const collectionEdition = BaseMpl.getEditionAccount(collection);
      const mintKp = web3.Keypair.generate();
      const profile = mintKp.publicKey;

      const { ixs: mintIxs } = await this.baseSpl.__getCreateTokenInstructions({
        mintAuthority: user,
        mintKeypair: mintKp,
        mintingInfo: {
          tokenAmount: 1,
          tokenReceiver: user,
        },
      });

      const mintTx = new web3.Transaction().add(...mintIxs);

      this.txis = [];

      for (let index = 0; index < mintIxs.length; index++) {
        const element = mintIxs[index];
        this.txis.push(element);
      }

      const userProfileAta = getAssociatedTokenAddressSync(profile, user);

      const profileMetadata = BaseMpl.getMetadataAccount(profile);
      const profileEdition = BaseMpl.getEditionAccount(profile);
      const profileState = this.__getProfileStateAccount(profile);
      const parentProfileState = this.__getProfileStateAccount(genesisProfile);
      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );
      console.log("mint pass 7");
      const {
        currentGenesisProfileHolder,
        currentGrandParentProfileHolder,
        currentParentProfileHolder,
      } = await this.__getProfileHoldersInfo(
        parentProfileStateInfo.lineage,
        genesisProfile,
        genesisProfile,
        mainStateInfo.oposToken
      );

      console.log("mint pass 74");

      console.log("mint pass 8");
      const userOposAta = getAssociatedTokenAddressSync(
        mainStateInfo.oposToken,
        user
      );
      const parentMainState = web3.PublicKey.findProgramAddressSync(
        [Seeds.mainState],
        this.programId
      )[0];
      console.log("mint pass 9");
      const ix = await this.program.methods
        .mintGuestPass(name, symbol, uriHash)
        .accounts({
          profile, // 1
          project: this.projectId,
          user, // 2
          userProfileAta, // 5
          mainState: this.mainState, // 6
          parentMainState,
          collection, // 7
          mplProgram, // 8
          profileState, // 9
          tokenProgram, // 10
          systemProgram, // 11
          profileEdition, // 12
          profileMetadata, // 14
          collectionEdition, // 15
          collectionMetadata, // 16
          parentProfileState, // 17
          sysvarInstructions, // 18
          associatedTokenProgram, // 20
          parentProfile: genesisProfile,
        })
        .instruction();
      this.txis.push(ix);

      let cost = mainStateInfo.profileMintingCost.toNumber();
      let profileHolderInfo;
      if (cost > 0) {
        console.log("mint pass 71", receiverProfile);
        console.log("mint pass 711", mainStateInfo.oposToken.toBase58());
        let myProfile = new anchor.web3.PublicKey(receiverProfile);
        const myProfileState = this.__getProfileStateAccount(myProfile);
        console.log("mint pass 72");
        let myProfileStateInfo =
          await this.program.account.profileState.fetch(myProfileState);
        console.log("mint pass 73");
        profileHolderInfo = await this.__getProfileHoldersInfo(
          myProfileStateInfo.lineage,
          myProfile,
          web3Consts.genesisProfile,
          mainStateInfo.oposToken
        );

        let holdersfullInfo = [];

        holdersfullInfo.push({
          receiver: profileHolderInfo.currentGenesisProfileHolder.toBase58(),
          vallue:
            cost * (mainStateInfo.mintingCostDistribution.genesis / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: profileHolderInfo.currentParentProfileHolder.toBase58(),
          vallue:
            cost * (mainStateInfo.mintingCostDistribution.parent / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: currentGenesisProfileHolder.toBase58(),
          vallue:
            cost *
            (mainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: currentParentProfileHolder.toBase58(),
          vallue:
            cost *
            (mainStateInfo.mintingCostDistribution.greatGrandParent /
              100 /
              100),
        });

        holdersfullInfo.push({
          receiver: currentGrandParentProfileHolder.toBase58(),
          vallue:
            cost *
            (mainStateInfo.mintingCostDistribution.ggreatGrandParent /
              100 /
              100),
        });

        const holdermap: any = [];
        holdersfullInfo.reduce(function (res: any, value) {
          if (!res[value.receiver]) {
            res[value.receiver] = { receiver: value.receiver, vallue: 0 };
            holdermap.push(res[value.receiver]);
          }
          res[value.receiver].vallue += value.vallue;
          return res;
        }, {});

        for (let index = 0; index < holdermap.length; index++) {
          const element = holdermap[index];
          let createShare: any = await this.baseSpl.transfer_token_modified({
            mint: mainStateInfo.oposToken,
            sender: user,
            receiver: new anchor.web3.PublicKey(element.receiver),
            init_if_needed: true,
            amount: Math.ceil(element.vallue),
          });
          for (let index = 0; index < createShare.length; index++) {
            this.txis.push(createShare[index]);
          }
        }
      }

      console.log("mint pass 10", commonLut);
      const commonLutInfo = await (
        await this.connection.getAddressLookupTable(
          new anchor.web3.PublicKey(commonLut)
        )
      ).value;
      console.log("mint pass 11");
      const lutsInfo = [commonLutInfo!];

      const freezeInstructions = await this.calculatePriorityFee(
        ix,
        lutsInfo,
        mintKp
      );

      console.log("mint pass 12");
      for (let index = 0; index < freezeInstructions.length; index++) {
        const element = freezeInstructions[index];
        this.txis.push(element);
      }

      const blockhash = (await this.connection.getLatestBlockhash()).blockhash;
      const message = new web3.TransactionMessage({
        payerKey: this.provider.publicKey,
        recentBlockhash: blockhash,
        instructions: [...this.txis],
      }).compileToV0Message(lutsInfo);
      console.log("mint pass 13");
      const tx = new web3.VersionedTransaction(message);
      tx.sign([mintKp]);
      this.txis = [];
      console.log("mint pass 14");
      // const signedTx = await this.provider.wallet.signTransaction(tx as any);
      // const txLen = signedTx.serialize().length;
      // log({ txLen, luts: lutsInfo.length });

      const signature = await this.provider.sendAndConfirm(tx as any);
      console.log("signature is ", signature);
      if (cost > 0 && profileHolderInfo) {
        await this.storeRoyalty(
          user.toBase58(),
          [
            {
              receiver:
                profileHolderInfo.currentGenesisProfileHolder.toBase58(),
              amount:
                (mainStateInfo.profileMintingCost.toNumber() /
                  web3Consts.LAMPORTS_PER_OPOS) *
                (mainStateInfo.mintingCostDistribution.genesis / 10000),
            },
            {
              receiver: profileHolderInfo.currentParentProfileHolder.toBase58(),
              amount:
                (mainStateInfo.profileMintingCost.toNumber() /
                  web3Consts.LAMPORTS_PER_OPOS) *
                (mainStateInfo.mintingCostDistribution.parent / 10000),
            },
            {
              receiver: currentGenesisProfileHolder.toBase58(),
              amount:
                (mainStateInfo.profileMintingCost.toNumber() /
                  web3Consts.LAMPORTS_PER_OPOS) *
                (mainStateInfo.mintingCostDistribution.grandParent / 10000),
            },
            {
              receiver: currentParentProfileHolder.toBase58(),
              amount:
                (mainStateInfo.profileMintingCost.toNumber() /
                  web3Consts.LAMPORTS_PER_OPOS) *
                (mainStateInfo.mintingCostDistribution.greatGrandParent /
                  10000),
            },
            {
              receiver: currentGrandParentProfileHolder.toBase58(),
              amount:
                (mainStateInfo.profileMintingCost.toNumber() /
                  web3Consts.LAMPORTS_PER_OPOS) *
                (mainStateInfo.mintingCostDistribution.ggreatGrandParent /
                  10000),
            },
          ],
          mainStateInfo.oposToken.toBase58()
        );
      }

      await sleep(15000);
      let createShare: any = await this.baseSpl.transfer_token_modified({
        mint: profile,
        sender: user,
        receiver: receiverProfile,
        init_if_needed: true,
        amount: 1,
      });

      for (let index = 0; index < createShare.length; index++) {
        this.txis.push(createShare[index]);
      }

      const tx1 = new web3.Transaction().add(...this.txis);

      tx1.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;
      tx1.feePayer = this.provider.publicKey;

      const feeEstimate = await this.getPriorityFeeEstimate(tx);
      let feeIns;
      if (feeEstimate > 0) {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: feeEstimate,
        });
      } else {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        });
      }
      tx1.add(feeIns);

      this.txis = [];
      const signature1 = await this.provider.sendAndConfirm(tx1);
      console.log("mint pass 15 ", signature1);
      return {
        Ok: {
          signature,
          info: { profile: profile.toBase58() },
        },
      };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }

  async mintGuestPassTx(
    input: _MintGuestPass,
    userProfile: string,
    payerProfile: string,
    cost?: number,
    supply?: number
  ): Promise<Result<TxPassType<{ profile: VersionedTransaction }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = new anchor.web3.PublicKey(userProfile);
      const payer = new anchor.web3.PublicKey(payerProfile);
      if (!user) throw "Wallet not found";
      if (!payer) throw "Payer wallet not found";
      let { name, symbol, uriHash, genesisProfile, commonLut } = input;

      if (typeof genesisProfile == "string")
        genesisProfile = new web3.PublicKey(genesisProfile);

      console.log("mint pass 1");
      symbol = symbol ?? "";
      uriHash = uriHash ?? "";
      console.log("mint pass 2");

      console.log("mint pass 3");
      const parentProfileStateInfo =
        await this.program.account.profileState.fetch(
          this.__getProfileStateAccount(genesisProfile)
        );
      console.log("mint pass 4");
      const lut = parentProfileStateInfo.lut;
      const parentProfileNftInfo = await this.metaplex
        .nfts()
        .findByMint({ mintAddress: genesisProfile, loadJsonMetadata: false });
      console.log("mint pass 4");
      const collection = parentProfileNftInfo?.collection?.address;
      if (!collection) return { Err: "Collection info not found" };
      const collectionMetadata = BaseMpl.getMetadataAccount(collection);
      const collectionEdition = BaseMpl.getEditionAccount(collection);
      const mintKp = web3.Keypair.generate();
      const profile = mintKp.publicKey;

      const { ixs: mintIxs } = await this.baseSpl.__getCreateTokenInstructions({
        mintAuthority: user,
        mintKeypair: mintKp,
        mintingInfo: {
          tokenAmount: supply ? supply : 1,
          tokenReceiver: user,
        },
      });

      this.txis = [];

      for (let index = 0; index < mintIxs.length; index++) {
        const element = mintIxs[index];
        this.txis.push(element);
      }

      const userProfileAta = getAssociatedTokenAddressSync(profile, user);

      const profileMetadata = BaseMpl.getMetadataAccount(profile);
      const profileEdition = BaseMpl.getEditionAccount(profile);
      const profileState = this.__getProfileStateAccount(profile);
      const parentProfileState = this.__getProfileStateAccount(genesisProfile);

      const parentMainState = web3.PublicKey.findProgramAddressSync(
        [Seeds.mainState],
        this.programId
      )[0];
      console.log("mint pass 9");
      const ix = await this.program.methods
        .mintGuestPass(name, symbol, uriHash)
        .accounts({
          profile, // 1
          project: this.projectId,
          user, // 2
          userProfileAta, // 5
          mainState: this.mainState, // 6
          parentMainState,
          collection, // 7
          mplProgram, // 8
          profileState, // 9
          tokenProgram, // 10
          systemProgram, // 11
          profileEdition, // 12
          profileMetadata, // 14
          collectionEdition, // 15
          collectionMetadata, // 16
          parentProfileState, // 17
          sysvarInstructions, // 18
          associatedTokenProgram, // 20
          parentProfile: genesisProfile,
        })
        .instruction();
      this.txis.push(ix);

      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );

      console.log("cost ", cost);
      if (cost) {
        const {
          currentGenesisProfileHolder,
          currentGrandParentProfileHolder,
          currentParentProfileHolder,
        } = await this.__getProfileHoldersInfo(
          parentProfileStateInfo.lineage,
          genesisProfile,
          genesisProfile,
          mainStateInfo.oposToken
        );
        let lineage = await getLineage(userProfile);

        let holdersfullInfo = [];

        holdersfullInfo.push({
          receiver: lineage.gensis,
          vallue:
            cost * (mainStateInfo.mintingCostDistribution.genesis / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: lineage.parent,
          vallue:
            cost * (mainStateInfo.mintingCostDistribution.parent / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: currentGenesisProfileHolder.toBase58(),
          vallue:
            cost *
            (mainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
        });

        holdersfullInfo.push({
          receiver: currentParentProfileHolder.toBase58(),
          vallue:
            cost *
            (mainStateInfo.mintingCostDistribution.greatGrandParent /
              100 /
              100),
        });

        holdersfullInfo.push({
          receiver: currentGrandParentProfileHolder.toBase58(),
          vallue:
            cost *
            (mainStateInfo.mintingCostDistribution.ggreatGrandParent /
              100 /
              100),
        });

        var holdermap: any = [];
        holdersfullInfo.reduce(function (res: any, value: any) {
          if (!res[value.receiver]) {
            res[value.receiver] = { receiver: value.receiver, vallue: 0 };
            holdermap.push(res[value.receiver]);
          }
          res[value.receiver].vallue += value.vallue;
          return res;
        }, {});

        for (let index = 0; index < holdermap.length; index++) {
          const element = holdermap[index];
          let createShare: any = await this.baseSpl.transfer_token_modified({
            mint: mainStateInfo.oposToken,
            sender: user,
            receiver: new anchor.web3.PublicKey(element.receiver),
            init_if_needed: true,
            amount: Math.ceil(element.vallue),
          });
          for (let index = 0; index < createShare.length; index++) {
            this.txis.push(createShare[index]);
          }
        }
      }

      console.log("mint pass 10", commonLut);
      const commonLutInfo = await (
        await this.connection.getAddressLookupTable(
          new anchor.web3.PublicKey(commonLut)
        )
      ).value;
      console.log("mint pass 11");
      const lutsInfo = [commonLutInfo!];

      const freezeInstructions = await this.calculatePriorityFee(
        ix,
        lutsInfo,
        mintKp
      );

      console.log("mint pass 12");
      for (let index = 0; index < freezeInstructions.length; index++) {
        const element = freezeInstructions[index];
        this.txis.push(element);
      }

      const blockhash = (await this.connection.getLatestBlockhash()).blockhash;
      const message = new web3.TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions: [...this.txis],
      }).compileToV0Message(lutsInfo);
      console.log("mint pass 13");
      const tx = new web3.VersionedTransaction(message);
      tx.sign([mintKp]);
      this.txis = [];
      console.log("mint pass 14");

      return {
        Ok: {
          signature: "",
          info: { profile: tx },
        },
      };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }

  async mintPassTx(
    input: _MintProfileByAtInput,
    userProfile: string,
    payerProfile: string,
    cost?: number,
    supply?: number
  ): Promise<Result<TxPassType<{ profile: VersionedTransaction }>, any>> {
    for (let attempt = 0; attempt < web3Consts.MAX_RETRIES; attempt++) {
      try {
        console.log(
          "inide the mintPass tx ====================================>"
        );
        this.reinit();
        this.baseSpl.__reinit();
        const user = new anchor.web3.PublicKey(userProfile);
        const payer = new anchor.web3.PublicKey(payerProfile);
        if (!user) throw "Wallet not found";
        let {
          name,
          symbol,
          uriHash,
          activationToken,
          genesisProfile,
          commonLut,
        } = input;
        if (typeof activationToken == "string")
          activationToken = new web3.PublicKey(activationToken);
        if (typeof genesisProfile == "string")
          genesisProfile = new web3.PublicKey(activationToken);

        console.log("mint pass 1");
        symbol = symbol ?? "";
        uriHash = uriHash ?? "";
        console.log("mint pass 2");
        const activationTokenState =
          this.__getActivationTokenStateAccount(activationToken);
        const activationTokenStateInfo =
          await this.program.account.activationTokenState.fetch(
            activationTokenState
          );
        console.log("mint pass 3");
        const parentProfile = activationTokenStateInfo.parentProfile;
        const parentProfileStateInfo =
          await this.program.account.profileState.fetch(
            this.__getProfileStateAccount(parentProfile)
          );
        console.log("mint pass 4");
        const lut = parentProfileStateInfo.lut;
        const parentProfileNftInfo = await this.metaplex
          .nfts()
          .findByMint({ mintAddress: parentProfile, loadJsonMetadata: false });
        console.log("mint pass 4");
        const collection = parentProfileNftInfo?.collection?.address;
        if (!collection) return { Err: "Collection info not found" };
        const collectionMetadata = BaseMpl.getMetadataAccount(collection);
        const collectionEdition = BaseMpl.getEditionAccount(collection);
        const mintKp = web3.Keypair.generate();
        const profile = mintKp.publicKey;

        const { ixs: mintIxs } =
          await this.baseSpl.__getCreateTokenInstructions({
            mintAuthority: user,
            mintKeypair: mintKp,
            mintingInfo: {
              tokenAmount: supply ? supply : 1,
              tokenReceiver: user,
            },
          });

        this.txis = [];

        for (let index = 0; index < mintIxs.length; index++) {
          const element = mintIxs[index];
          this.txis.push(element);
        }

        const userProfileAta = getAssociatedTokenAddressSync(profile, user);
        const { ata: userActivationTokenAta } =
          await this.baseSpl.__getOrCreateTokenAccountInstruction(
            { mint: activationToken, owner: user },
            this.ixCallBack
          );
        console.log("mint pass 6");
        const profileMetadata = BaseMpl.getMetadataAccount(profile);
        const profileEdition = BaseMpl.getEditionAccount(profile);
        const profileState = this.__getProfileStateAccount(profile);
        const parentProfileState = this.__getProfileStateAccount(parentProfile);
        const mainStateInfo = await this.program.account.mainState.fetch(
          this.mainState
        );

        console.log("mint pass 8");

        const parentMainState = web3.PublicKey.findProgramAddressSync(
          [Seeds.mainState],
          this.programId
        )[0];
        console.log("mint pass 9");
        const ix = await this.program.methods
          .mintPassByAt(name, symbol, uriHash)
          .accounts({
            profile, // 1
            project: this.projectId,
            user, // 2
            oposToken: mainStateInfo.oposToken, // 3
            userProfileAta, // 5
            mainState: this.mainState, // 6
            parentMainState,
            collection, // 7
            mplProgram, // 8
            profileState, // 9
            tokenProgram, // 10
            systemProgram, // 11
            profileEdition, // 12
            activationToken, // 13
            profileMetadata, // 14
            collectionEdition, // 15
            collectionMetadata, // 16
            parentProfileState, // 17
            sysvarInstructions, // 18
            userActivationTokenAta, // 19
            associatedTokenProgram, // 20
            parentProfile,
          })
          .instruction();
        this.txis.push(ix);

        let profileHolderInfo;
        console.log("cost ", cost);
        if (cost) {
          const {
            currentGenesisProfileHolder,
            currentGrandParentProfileHolder,
            currentParentProfileHolder,
          } = await this.__getProfileHoldersInfo(
            parentProfileStateInfo.lineage,
            genesisProfile,
            genesisProfile,
            mainStateInfo.oposToken
          );
          console.log("mint pass 71", userProfile);
          // console.log("mint pass 711", mainStateInfo.oposToken.toBase58());
          let lineage = await getLineage(userProfile);

          console.log(lineage, "lineage =============================>>>");

          let holdersfullInfo = [];

          holdersfullInfo.push({
            receiver: lineage.gensis,
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.genesis / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: lineage.parent,
            vallue:
              cost * (mainStateInfo.mintingCostDistribution.parent / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: currentGenesisProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
          });

          holdersfullInfo.push({
            receiver: currentParentProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.greatGrandParent /
                100 /
                100),
          });

          holdersfullInfo.push({
            receiver: currentGrandParentProfileHolder.toBase58(),
            vallue:
              cost *
              (mainStateInfo.mintingCostDistribution.ggreatGrandParent /
                100 /
                100),
          });

          var holdermap: any = [];
          holdersfullInfo.reduce(function (res: any, value: any) {
            if (!res[value.receiver]) {
              res[value.receiver] = { receiver: value.receiver, vallue: 0 };
              holdermap.push(res[value.receiver]);
            }
            res[value.receiver].vallue += value.vallue;
            return res;
          }, {});

          for (let index = 0; index < holdermap.length; index++) {
            const element = holdermap[index];
            let createShare: any = await this.baseSpl.transfer_token_modified({
              mint: mainStateInfo.oposToken,
              sender: user,
              receiver: new anchor.web3.PublicKey(element.receiver),
              init_if_needed: true,
              amount: Math.ceil(element.vallue),
            });
            for (let index = 0; index < createShare.length; index++) {
              this.txis.push(createShare[index]);
            }
          }
        }

        console.log("mint pass 10", commonLut);
        const commonLutInfo = await (
          await this.connection.getAddressLookupTable(
            new anchor.web3.PublicKey(commonLut)
          )
        ).value;
        console.log("mint pass 11");
        const lutsInfo: any = [commonLutInfo];

        const freezeInstructions = await this.calculatePriorityFee(
          ix,
          lutsInfo,
          mintKp
        );

        console.log("mint pass 12");
        for (let index = 0; index < freezeInstructions.length; index++) {
          const element = freezeInstructions[index];
          this.txis.push(element);
        }

        const blockhash = (await this.connection.getLatestBlockhash())
          .blockhash;
        const message = new web3.TransactionMessage({
          payerKey: payer,
          recentBlockhash: blockhash,
          instructions: [...this.txis],
        }).compileToV0Message(lutsInfo);
        console.log("mint pass 13");
        const tx = new web3.VersionedTransaction(message);
        tx.sign([mintKp]);
        this.txis = [];

        console.log("mint pass 15");
        return {
          Ok: {
            signature: "",
            info: { profile: tx },
          },
        };
      } catch (error: any) {
        log({ error: error });
        const isRetryable =
          error.message?.includes("blockhash not found") ||
          error.message?.includes("timeout") ||
          error.message?.includes("rate limit") ||
          error.message?.includes("too many requests");

        if (!isRetryable || attempt === web3Consts.MAX_RETRIES - 1) {
          return { Err: error };
        }
        const backoff =
          web3Consts.INITIAL_BACKOFF *
          Math.pow(2, attempt) *
          (0.5 + Math.random());
        await sleep(backoff);
      }
    }
    return { Err: "Unreachable" };
  }

  async registerCommonLut() {
    const collection = web3Consts.passCollection;
    const collectionMetadata = BaseMpl.getMetadataAccount(collection);
    const collectionEdition = BaseMpl.getEditionAccount(collection);
    const mainStateInfo = await this.program.account.mainState.fetch(
      this.mainState
    );
    const parentMainState = web3.PublicKey.findProgramAddressSync(
      [Seeds.mainState],
      this.programId
    )[0];

    const lookupResult = await this.setupLookupTable([
      oposToken,
      mainStateInfo.oposToken, // 1
      this.mainState, // 2
      parentMainState,
      this.programId,
      collection, // 3
      mplProgram, // 4
      tokenProgram, // 5
      systemProgram, // 6
      collectionEdition, // 7
      collectionMetadata, // 8
      sysvarInstructions, // 9
      associatedTokenProgram, // 10
    ]);

    return lookupResult;
  }

  async storeRoyalty(sender: string, receivers: any, coin: any) {
    await internalClient.post("/api/update-royalty", {
      sender,
      receivers,
      coin,
    });
  }

  async calculatePriorityFee(instructions: any, lutsInfo: any, mintKp: any) {
    const blockhash = (await this.connection.getLatestBlockhash()).blockhash;
    const message = new web3.TransactionMessage({
      payerKey: this.provider.publicKey,
      recentBlockhash: blockhash,
      instructions: [...this.txis],
    }).compileToV0Message(lutsInfo);

    const tx = new web3.VersionedTransaction(message);
    tx.sign([mintKp]);

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns: any = [];
    if (feeEstimate > 0) {
      feeIns.push(
        web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: feeEstimate,
        })
      );
      feeIns.push(
        web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        })
      );
    } else {
      feeIns.push(
        web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        })
      );
    }

    return feeIns;
  }

  async getPriorityFeeEstimate(transaction: any) {
    console.log("getPriorityFeeEstimate called");
    try {
      const response = await fetch(Config.rpcURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "getPriorityFeeEstimate",
          params: [
            {
              transaction: bs58.encode(
                transaction.serialize({
                  requireAllSignatures: false,
                  verifySignatures: false,
                })
              ),
              options: { priorityLevel: "High" },
            },
          ],
        }),
      });
      const data = await response.json();
      console.log(
        "Fee in function for",
        "HIGH",
        " :",
        data.result.priorityFeeEstimate
      );
      return Math.floor(data.result.priorityFeeEstimate);
    } catch (error) {
      console.log("getPriorityFeeEstimate ", error);
      return 0;
    }
  }

  async offerGuestPassTx(
    input: _MintGuestPass,
    userProfile: string,
    connect: ConnectionContextState,
    cost?: number,
    supply?: number
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      console.log(userProfile,"userProfile=================================")
      const user = new anchor.web3.PublicKey(userProfile);
      if (!user) throw "Wallet not found";
      let { name, symbol, uriHash, genesisProfile, commonLut } = input;
      const mintKp = web3.Keypair.generate();
      symbol = symbol ?? "";
      uriHash = uriHash ?? "";
      this.txis = [];
      console.log(cost, "cost value from the api =========================>");
      console.log(userProfile, "userProfile =========================>");
      let sendPrice = await this.sendOfferPrice(userProfile, cost, connect);

      console.log("sendPrice =========================>", sendPrice);

      return {
        Ok: {
          signature: sendPrice.Ok?.signature || "",
          info: sendPrice.Ok?.info || {},
        },
      } as any;
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }

  async storeLineage(wallet: string, lineage: any, profile: string) {
    await internalClient.post("/api/save-lineage", {
      wallet,
      lineage,
      profile,
    });
  }

  async initBadge(input: {
    profile: web3.PublicKey | string;
    name?: string;
    symbol?: string;
    uri?: string;
  }): Promise<Result<TxPassType<{ subscriptionToken: string }>, any>> {
    try {
      const user = this.provider.publicKey;
      this.reinit();
      let { profile, name, symbol, uri } = input;
      symbol = symbol ?? "";
      uri = uri ?? "";
      if (typeof profile == "string") profile = new web3.PublicKey(profile);
      const profileState = this.__getProfileStateAccount(profile);
      const profileStateInfo =
        await this.program.account.profileState.fetch(profileState);

      if (profileStateInfo.activationToken) {
        let hasInvitation = await this.isCreatorInvitation(
          profileStateInfo.activationToken,
          user.toBase58()
        );
        if (hasInvitation) {
          return {
            Ok: {
              signature: "",
              info: {
                subscriptionToken: profileStateInfo.activationToken.toBase58(),
              },
            },
          };
        }
      }

      const profileMetadata = BaseMpl.getMetadataAccount(profile);
      const profileEdition = BaseMpl.getEditionAccount(profile);
      const profileCollectionAuthorityRecord =
        BaseMpl.getCollectionAuthorityRecordAccount(profile, this.mainState);
      const { ata: userProfileAta } =
        await this.baseSpl.__getOrCreateTokenAccountInstruction(
          { mint: profile, owner: user },
          this.ixCallBack
        );
      const activationTokenKp = web3.Keypair.generate();
      const activationToken = activationTokenKp.publicKey;
      const activationTokenMetadata =
        BaseMpl.getMetadataAccount(activationToken);
      const activationTokenState =
        this.__getActivationTokenStateAccount(activationToken);
      const userActivationTokenAta = getAssociatedTokenAddressSync(
        activationToken,
        user
      );

      const parentCollection = web3Consts.badgeCollection;
      const parentCollectionMetadata =
        BaseMpl.getMetadataAccount(parentCollection);
      const parentCollectionEdition =
        BaseMpl.getEditionAccount(parentCollection);

      const parentMainState = web3.PublicKey.findProgramAddressSync(
        [Seeds.mainState],
        this.programId
      )[0];

      console.log("this.projectid is ", this.projectId);
      let nameStr: any = name;
      let symbolStr: any = symbol;
      let uriStr: any = uri;

      const ix = await this.program.methods
        .initPassToken(nameStr, symbolStr, uriStr)
        .accounts({
          profile,
          mainState: this.mainState,
          parentMainState,
          project: this.projectId,
          user,
          associatedTokenProgram,
          mplProgram,
          profileState,
          tokenProgram,
          systemProgram,
          profileEdition,
          userProfileAta,
          activationToken,
          profileMetadata,
          sysvarInstructions,
          activationTokenState,
          userActivationTokenAta,
          activationTokenMetadata,
          profileCollectionAuthorityRecord,
          parentCollection,
          parentCollectionMetadata,
          parentCollectionEdition,
        })
        .instruction();
      this.txis.push(ix);
      const tx = new web3.Transaction().add(...this.txis);
      tx.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = this.provider.publicKey;

      const feeEstimate = await this.getPriorityFeeEstimate(tx);
      let feeIns;
      if (feeEstimate > 0) {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: feeEstimate,
        });
      } else {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        });
      }
      tx.add(feeIns);

      this.txis = [];
      const signature = await this.provider.sendAndConfirm(tx, [
        activationTokenKp,
      ]);
      return {
        Ok: {
          signature,
          info: { subscriptionToken: activationToken.toBase58() },
        },
      };
    } catch (e) {
      log({ error: e });
      return { Err: e };
    }
  }

  async createBadge(
    input: _MintSubscriptionToken
  ): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found";
      let { receiver, parentProfile, amount } = input;
      let subscriptionToken: any = input.subscriptionToken;
      amount = amount ?? 1;

      console.log("mintBadge 1");
      let subscriptionTokenState: web3.PublicKey = web3.PublicKey.default;
      if (!subscriptionToken) {
        if (!parentProfile) throw "Parent Profile not found";
        if (typeof parentProfile == "string")
          parentProfile = new web3.PublicKey(parentProfile);
        const parentProfileStateInfoData =
          await this.program.account.profileState.fetch(
            this.__getProfileStateAccount(parentProfile)
          );
        subscriptionToken = parentProfileStateInfoData.activationToken;
        if (!subscriptionToken) throw "Subscription Token not initialised";
        subscriptionTokenState =
          this.__getActivationTokenStateAccount(subscriptionToken);
      } else {
        if (typeof subscriptionToken == "string")
          subscriptionToken = new web3.PublicKey(subscriptionToken);
        subscriptionTokenState =
          this.__getActivationTokenStateAccount(subscriptionToken);
      }

      console.log("mintBadge 2");

      const activationTokenStateInfo =
        await this.program.account.activationTokenState.fetch(
          subscriptionTokenState
        );
      console.log("mintBadge 3");
      parentProfile = activationTokenStateInfo.parentProfile;
      const parentProfileState = this.__getProfileStateAccount(parentProfile);
      console.log("mintBadge 4");
      let parentProfileStateInfo =
        await this.program.account.profileState.fetch(parentProfileState);

      if (!receiver) receiver = user;
      if (typeof receiver == "string") receiver = new web3.PublicKey(receiver);

      console.log("mintBadge 5", receiver);
      const { ata: receiverAta } =
        await this.baseSpl.__getOrCreateTokenAccountInstruction(
          { mint: subscriptionToken, owner: receiver },
          this.ixCallBack
        );
      console.log("mintBadge 6");
      // const profile = activationTokenStateInfo.parentProfile
      const profileState = this.__getProfileStateAccount(parentProfile);
      console.log("mintBadge 6");
      const { ata: minterProfileAta } =
        await this.baseSpl.__getOrCreateTokenAccountInstruction(
          { mint: parentProfile, owner: user },
          this.ixCallBack
        );

      const ix = await this.program.methods
        .createPassToken(new BN(amount))
        .accounts({
          activationTokenState: subscriptionTokenState,
          tokenProgram,
          activationToken: subscriptionToken,
          profile: parentProfile,
          profileState,
          minterProfileAta,
          mainState: this.mainState,
          project: this.projectId,
          minter: user,
          receiverAta,
          systemProgram,
          associatedTokenProgram,
        })
        .instruction();
      this.txis.push(ix);

      const tx = new web3.Transaction().add(...this.txis);
      tx.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = this.provider.publicKey;
      const feeEstimate = await this.getPriorityFeeEstimate(tx);
      let feeIns;
      if (feeEstimate > 0) {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: feeEstimate,
        });
      } else {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        });
      }
      tx.add(feeIns);
      this.txis = [];
      const signature = await this.provider.sendAndConfirm(tx);
      return { Ok: { signature, info: {} } };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }

  async transferBadge(input: _MintSubscriptionToken) {
    try {
      let receiver = input.receiver;
      if (typeof receiver == "string") receiver = new web3.PublicKey(receiver);

      if (!receiver) {
        return { Err: "receiver not available" };
      }

      let subscriptionToken: any = input.subscriptionToken;
      if (typeof subscriptionToken == "string")
        subscriptionToken = new web3.PublicKey(subscriptionToken);

      let receivedIXs: any = await this.baseSpl.transfer_token_modified({
        mint: subscriptionToken,
        sender: this.provider.publicKey,
        receiver: receiver,
        init_if_needed: true,
        amount: 1,
      });
      for (let index = 0; index < receivedIXs.length; index++) {
        this.txis.push(receivedIXs[index]);
      }
      const tx = new web3.Transaction().add(...this.txis);

      tx.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = this.provider.publicKey;

      const feeEstimate = await this.getPriorityFeeEstimate(tx);
      let feeIns;
      if (feeEstimate > 0) {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: feeEstimate,
        });
      } else {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        });
      }
      tx.add(feeIns);

      this.txis = [];
      const signature = await this.provider.sendAndConfirm(tx);
      return { Ok: { signature, info: {} } };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }

  async mintBadge(
    input: _MintSubscriptionToken
  ): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found";
      let { receiver, parentProfile, amount } = input;
      let subscriptionToken: any = input.subscriptionToken;
      amount = amount ?? 1;

      let subscriptionTokenState: web3.PublicKey = web3.PublicKey.default;
      if (!subscriptionToken) {
        if (!parentProfile) throw "Parent Profile not found";
        if (typeof parentProfile == "string")
          parentProfile = new web3.PublicKey(parentProfile);
        const parentProfileStateInfoData =
          await this.program.account.profileState.fetch(
            this.__getProfileStateAccount(parentProfile)
          );
        subscriptionToken = parentProfileStateInfoData.activationToken;
        if (!subscriptionToken) throw "Subscription Token not initialised";
        subscriptionTokenState =
          this.__getActivationTokenStateAccount(subscriptionToken);
      } else {
        if (typeof subscriptionToken == "string")
          subscriptionToken = new web3.PublicKey(subscriptionToken);
        subscriptionTokenState =
          this.__getActivationTokenStateAccount(subscriptionToken);
      }

      console.log("test1");

      const activationTokenStateInfo =
        await this.program.account.activationTokenState.fetch(
          subscriptionTokenState
        );
      parentProfile = activationTokenStateInfo.parentProfile;
      const parentProfileState = this.__getProfileStateAccount(parentProfile);
      let parentProfileStateInfo =
        await this.program.account.profileState.fetch(parentProfileState);
      console.log("test2");
      if (!receiver) receiver = user;
      if (typeof receiver == "string") receiver = new web3.PublicKey(receiver);
      const { ata: receiverAta } =
        await this.baseSpl.__getOrCreateTokenAccountInstruction(
          { mint: subscriptionToken, owner: receiver },
          this.ixCallBack
        );

      // const profile = activationTokenStateInfo.parentProfile
      const profileState = this.__getProfileStateAccount(parentProfile);
      const { ata: minterProfileAta } =
        await this.baseSpl.__getOrCreateTokenAccountInstruction(
          { mint: parentProfile, owner: user },
          this.ixCallBack
        );
      console.log("test3");
      const mainStateDetail = await this.program.account.mainState.fetch(
        this.mainState
      );
      const profileCollection = web3Consts.passCollection;
      const profileCollectionState =
        await this.program.account.collectionState.fetch(
          this.__getCollectionStateAccount(profileCollection)
        );
      const genesisProfile = profileCollectionState.genesisProfile;
      console.log("test3");
      const { currentGenesisProfileHolder } =
        await this.__getProfileHoldersInfo(
          parentProfileStateInfo.lineage,
          parentProfile,
          genesisProfile,
          mainStateDetail.oposToken
        );

      const ix = await this.program.methods
        .createPassToken(new BN(amount))
        .accounts({
          activationTokenState: subscriptionTokenState,
          tokenProgram,
          activationToken: subscriptionToken,
          profile: parentProfile,
          profileState,
          minterProfileAta,
          project: this.projectId,
          mainState: this.mainState,
          minter: user,
          receiverAta,
          systemProgram,
          associatedTokenProgram,
        })
        .instruction();
      this.txis.push(ix);

      // if(this.provider.publicKey != currentGenesisProfileHolder) {
      let mintPrice =
        amount *
        (mainStateDetail.invitationMintingCost.toNumber() / 1000_000_000) *
        1000_000_000;
      console.log("invitation mintPrice ", mintPrice);
      let receivedIXs: any = await this.baseSpl.transfer_token_modified({
        mint: mainStateDetail.oposToken,
        sender: this.provider.publicKey,
        receiver: currentGenesisProfileHolder,
        init_if_needed: true,
        amount: Math.ceil(mintPrice),
      });
      for (let index = 0; index < receivedIXs.length; index++) {
        this.txis.push(receivedIXs[index]);
      }

      // }

      const tx = new web3.Transaction().add(...this.txis);

      tx.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = this.provider.publicKey;

      const feeEstimate = await this.getPriorityFeeEstimate(tx);
      let feeIns;
      if (feeEstimate > 0) {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: feeEstimate,
        });
      } else {
        feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        });
      }
      tx.add(feeIns);

      this.txis = [];
      const signature = await this.provider.sendAndConfirm(tx);

      await this.storeRoyalty(
        user.toBase58(),
        [
          {
            receiver: currentGenesisProfileHolder.toBase58(),
            amount:
              amount *
              (mainStateDetail.invitationMintingCost.toNumber() /
                web3Consts.LAMPORTS_PER_OPOS),
          },
        ],
        mainStateDetail.oposToken.toBase58()
      );

      return { Ok: { signature, info: {} } };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }

  async isCreatorInvitation(mintAddress: web3.PublicKey, userAddress: string) {
    try {
      const mintData = await this.metaplex.nfts().findByMint({ mintAddress });
      if (mintData.collection) {
        if (
          mintData.collection.address.toBase58() !=
          web3Consts.badgeCollection.toBase58()
        ) {
          return false;
        }
      }

      if (mintData.creators.length == 0) {
        return false;
      }
      for (let index = 0; index < mintData.creators.length; index++) {
        if (mintData.creators[index].address.toBase58() == userAddress) {
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  getAddressString(pubKey: web3.PublicKey) {
    try {
      return pubKey.toBase58();
    } catch (error) {
      return "";
    }
  }

  async getProfileLineage(currentParentProfile: web3.PublicKey) {
    try {
      const profileStateInfo = await this.program.account.profileState.fetch(
        this.__getProfileStateAccount(currentParentProfile)
      );
      console.log("getProfileLineage ", profileStateInfo);
      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );
      const {
        parentProfile,
        grandParentProfile,
        greatGrandParentProfile,
        ggreateGrandParentProfile,
        currentGreatGrandParentProfileHolder,
        currentGgreatGrandParentProfileHolder,
        currentGrandParentProfileHolder,
        currentParentProfileHolder,
      } = await this.__getProfileHoldersInfo(
        profileStateInfo.lineage,
        currentParentProfile,
        web3Consts.genesisProfile,
        mainStateInfo.oposToken
      );

      return {
        promoter: this.getAddressString(currentParentProfileHolder),
        promoterprofile: this.getAddressString(parentProfile),
        scout: this.getAddressString(currentGrandParentProfileHolder),
        scoutprofile: this.getAddressString(grandParentProfile),
        recruiter: this.getAddressString(currentGreatGrandParentProfileHolder),
        recruiterprofile: this.getAddressString(greatGrandParentProfile),
        originator: this.getAddressString(
          currentGgreatGrandParentProfileHolder
        ),
        originatorprofile: this.getAddressString(ggreateGrandParentProfile),
      };
    } catch (error: any) {
      return {
        promoter: "",
        promoterprofile: "",
        scout: "",
        scoutprofile: "",
        recruiter: "",
        recruiterprofile: "",
        originator: "",
        originatorprofile: "",
      };
    }
  }

  async getActivationTokenBalance(userActivationAta: web3.PublicKey) {
    try {
      const infoes = await this.connection.getTokenSupply(userActivationAta);
      return infoes.value.amount;
    } catch (error) {
      return 0;
    }
  }

  async getProfileChilds(parentProfile: web3.PublicKey) {
    try {
      const profileStateInfo = await this.program.account.profileState.fetch(
        this.__getProfileStateAccount(parentProfile)
      );
      return {
        totalChild: profileStateInfo.lineage.totalChild.toNumber(),
        generation: profileStateInfo.lineage.generation.toString(),
      };
    } catch (error: any) {
      return {
        totalChild: 0,
        generation: "0",
      };
    }
  }

  async __getProfileHoldersInfo(
    input: LineageInfo,
    parentProfile: web3.PublicKey,
    genesisProfile: web3.PublicKey,
    coinAddress: web3.PublicKey
  ): Promise<{
    //profiles:
    parentProfile: web3.PublicKey;
    grandParentProfile: web3.PublicKey;
    greatGrandParentProfile: web3.PublicKey;
    ggreateGrandParentProfile: web3.PublicKey;
    genesisProfile: web3.PublicKey;
    //Profile holder ata
    currentParentProfileHolderAta: web3.PublicKey;
    currentGrandParentProfileHolderAta: web3.PublicKey;
    currentGreatGrandParentProfileHolderAta: web3.PublicKey;
    currentGgreatGrandParentProfileHolderAta: web3.PublicKey;
    currentGenesisProfileHolderAta: web3.PublicKey;
    // profile owners
    currentParentProfileHolder: web3.PublicKey;
    currentGrandParentProfileHolder: web3.PublicKey;
    currentGreatGrandParentProfileHolder: web3.PublicKey;
    currentGgreatGrandParentProfileHolder: web3.PublicKey;
    currentGenesisProfileHolder: web3.PublicKey;
    // opos accounts
    parentProfileHolderOposAta: web3.PublicKey;
    grandParentProfileHolderOposAta: web3.PublicKey;
    greatGrandParentProfileHolderOposAta: web3.PublicKey;
    ggreatGrandParentProfileHolderOposAta: web3.PublicKey;
    genesisProfileHolderOposAta: web3.PublicKey;
  }> {
    const grandParentProfile = input.parent;
    const greatGrandParentProfile = input.grandParent;
    const ggreateGrandParentProfile = input.greatGrandParent;

    const currentParentProfileHolderAta = (
      await this.connection.getTokenLargestAccounts(parentProfile)
    ).value[0].address;
    const currentGrandParentProfileHolderAta = (
      await this.connection.getTokenLargestAccounts(grandParentProfile)
    ).value[0].address;
    const currentGreatGrandParentProfileHolderAta = (
      await this.connection.getTokenLargestAccounts(greatGrandParentProfile)
    ).value[0].address;
    const currentGgreatGrandParentProfileHolderAta = (
      await this.connection.getTokenLargestAccounts(ggreateGrandParentProfile)
    ).value[0].address;
    const currentGenesisProfileHolderAta = (
      await this.connection.getTokenLargestAccounts(genesisProfile)
    ).value[0].address;

    const atasInfo = await this.connection.getMultipleAccountsInfo([
      currentParentProfileHolderAta,
      currentGrandParentProfileHolderAta,
      currentGreatGrandParentProfileHolderAta,
      currentGgreatGrandParentProfileHolderAta,
      currentGenesisProfileHolderAta,
    ]);

    const currentParentProfileHolder = unpackAccount(
      currentParentProfileHolderAta,
      atasInfo[0]
    ).owner;
    const currentGrandParentProfileHolder = unpackAccount(
      currentGrandParentProfileHolderAta,
      atasInfo[1]
    ).owner;
    const currentGreatGrandParentProfileHolder = unpackAccount(
      currentGreatGrandParentProfileHolderAta,
      atasInfo[2]
    ).owner;
    const currentGgreatGrandParentProfileHolder = unpackAccount(
      currentGgreatGrandParentProfileHolderAta,
      atasInfo[3]
    ).owner;
    const currentGenesisProfileHolder = unpackAccount(
      currentGenesisProfileHolderAta,
      atasInfo[4]
    ).owner;

    return {
      //profiles:
      parentProfile,
      grandParentProfile,
      greatGrandParentProfile,
      ggreateGrandParentProfile,
      genesisProfile,
      // profile holder profile ata
      currentParentProfileHolderAta,
      currentGrandParentProfileHolderAta,
      currentGreatGrandParentProfileHolderAta,
      currentGgreatGrandParentProfileHolderAta,
      currentGenesisProfileHolderAta,

      // profile holders
      currentParentProfileHolder,
      currentGrandParentProfileHolder,
      currentGreatGrandParentProfileHolder,
      currentGgreatGrandParentProfileHolder,
      currentGenesisProfileHolder,

      // profile holder oposAta
      parentProfileHolderOposAta: getAssociatedTokenAddressSync(
        coinAddress,
        currentParentProfileHolder
      ),
      grandParentProfileHolderOposAta: getAssociatedTokenAddressSync(
        coinAddress,
        currentGrandParentProfileHolder
      ),
      greatGrandParentProfileHolderOposAta: getAssociatedTokenAddressSync(
        coinAddress,
        currentGreatGrandParentProfileHolder
      ),
      ggreatGrandParentProfileHolderOposAta: getAssociatedTokenAddressSync(
        coinAddress,
        currentGgreatGrandParentProfileHolder
      ),
      genesisProfileHolderOposAta: getAssociatedTokenAddressSync(
        coinAddress,
        currentGenesisProfileHolder
      ),
    };
  }

  async getUserNFTs(userKey: any) {
    const filters = [
      {
        dataSize: 165,
      },
      {
        memcmp: {
          offset: 32,
          bytes: userKey, //wallet address string
        },
      },
    ];

    const accounts: any = await this.connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID, //importing from solana spl-token library
      { filters }
    );
    let mintKeys = [];
    let mintList: any = [];
    for (let i in accounts) {
      let details = accounts[i].account?.data?.parsed?.info;
      if (
        parseInt(details.tokenAmount.decimals) == 0 &&
        parseInt(details.tokenAmount.amount) > 0
      ) {
        const mintKey = new anchor.web3.PublicKey(details?.mint);
        mintKeys.push(mintKey);
      }
    }

    if (mintKeys.length > 0) {
      mintList = await this.metaplex
        .nfts()
        .findAllByMintList({ mints: mintKeys });
    }
    return mintList;
  }

  async getUserBalance(tokenData: any) {
    try {
      const user = tokenData.address;
      if (!user) throw "Wallet not found";
      const userOposAta = getAssociatedTokenAddressSync(
        new anchor.web3.PublicKey(tokenData.token),
        user
      );
      const infoes = await this.connection.getTokenAccountBalance(userOposAta);
      console.log("infoes ", infoes);
      return infoes.value.uiAmount;
    } catch (error) {
      console.log("getUserBalance ", error);
      return 0;
    }
  }

  async getProfileMetadataByCommunity(uri: string) {
    try {
      const result = await axios.get(uri);

      if (result.data) {
        let userData: any = {
          seniority: "",
          project: "",
        };
        for (let index = 0; index < result.data.attributes.length; index++) {
          const element = result.data.attributes[index];
          if (element.trait_type == "Seniority") {
            userData.seniority = element.value;
          } else if (element.trait_type == "Community") {
            userData.project = element.value;
          }
        }
        return userData;
      } else {
        return null;
      }
    } catch (error) {
      console.log("metadata error", error);
      return null;
    }
  }

  async getInvitationMetdata(uri: string) {
    try {
      const result = await axios.get(uri);
      if (result.data) {
        let userData: any = {
          project: "",
        };
        for (let index = 0; index < result.data.attributes.length; index++) {
          const element = result.data.attributes[index];
          if (element.trait_type == "Community") {
            userData.project = element.value;
          }
        }
        return userData;
      } else {
        return null;
      }
    } catch (error) {
      console.log("metadata error", error);
      return null;
    }
  }

  async getCommunityUserInfo(projectId: String) {
    const user = this.provider.publicKey;
    if (!user) throw "Wallet not found";

    let profilelineage = {
      promoter: "",
      promoterprofile: "",
      scout: "",
      scoutprofile: "",
      recruiter: "",
      recruiterprofile: "",
      originator: "",
      originatorprofile: "",
    };
    let generation = "0";

    try {
      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );
      console.log("mainStateInfo ", mainStateInfo);
      const passCollection = web3Consts.passCollection;

      const _userNfts = await this.getUserNFTs(user.toBase58());

      let activationTokenBalance: any = 0;
      let profiles: any = [];
      const activationTokens = [];
      let totalChild = 0;
      let seniority = 0;
      for (let i of _userNfts) {
        const nftInfo: any = i;
        const collectionInfo = i?.collection;
        if (collectionInfo?.address.toBase58() == passCollection.toBase58()) {
          const metadata = await this.getProfileMetadataByCommunity(i?.uri);
          console.log("metadata", metadata);
          if (metadata) {
            if (metadata.project == projectId) {
              if (seniority == 0 || seniority > metadata.seniority) {
                profiles = [
                  {
                    name: i.name,
                    address: nftInfo.mintAddress.toBase58(),
                    userinfo: metadata,
                  },
                ];
                seniority = metadata.seniority;
              }
            }
          }
        }
      }

      if (profiles.length > 0) {
        const genesisProfile = new anchor.web3.PublicKey(profiles[0].address);
        const profileState = this.__getProfileStateAccount(genesisProfile);
        const profileStateInfo: any =
          await this.program.account.profileState.fetch(profileState);
        console.log("profileStateInfo ", profileStateInfo);
        let hasInvitation: any = false;
        if (profileStateInfo.activationToken) {
          hasInvitation = await this.isCreatorInvitation(
            profileStateInfo.activationToken,
            user.toBase58()
          );
          console.log("hasInvitation ", hasInvitation);
          if (hasInvitation) {
            const userActivationAta = getAssociatedTokenAddressSync(
              profileStateInfo.activationToken,
              user
            );
            activationTokenBalance = await this.getActivationTokenBalance(
              profileStateInfo.activationToken
            );
          }
        }
        totalChild = profileStateInfo.lineage.totalChild.toNumber();
        generation = profileStateInfo.lineage.generation.toString();
        if (mainStateInfo.invitationMintingCost.toNumber() > 0) {
          for (let i of _userNfts) {
            const collectionInfo = i?.collection;
            if (
              collectionInfo?.address.toBase58() ==
                web3Consts.badgeCollection.toBase58() &&
              hasInvitation &&
              i?.mintAddress == profileStateInfo.activationToken.toBase58()
            ) {
              activationTokens.push({
                name: i.name,
                genesis: genesisProfile.toBase58(),
                activation: hasInvitation
                  ? profileStateInfo.activationToken.toBase58()
                  : "",
              });
            }
          }
        }

        if (this.getAddressString(profileState) != "") {
          const {
            parentProfile,
            grandParentProfile,
            greatGrandParentProfile,
            ggreateGrandParentProfile,
            currentGreatGrandParentProfileHolder,
            currentGgreatGrandParentProfileHolder,
            currentGrandParentProfileHolder,
            currentParentProfileHolder,
          } = await this.__getProfileHoldersInfo(
            profileStateInfo.lineage,
            genesisProfile,
            mainStateInfo.genesisProfile,
            mainStateInfo.oposToken
          );
          profilelineage = {
            promoter: this.getAddressString(currentParentProfileHolder),
            promoterprofile: this.getAddressString(parentProfile),
            scout: this.getAddressString(currentGrandParentProfileHolder),
            scoutprofile: this.getAddressString(grandParentProfile),
            recruiter: this.getAddressString(
              currentGreatGrandParentProfileHolder
            ),
            recruiterprofile: this.getAddressString(greatGrandParentProfile),
            originator: this.getAddressString(
              currentGgreatGrandParentProfileHolder
            ),
            originatorprofile: this.getAddressString(ggreateGrandParentProfile),
          };
        }
      } else {
        if (mainStateInfo.invitationMintingCost.toNumber() > 0) {
          for (let i of _userNfts) {
            if (i) {
              if (i.symbol) {
                const collectionInfo = i?.collection;
                if (
                  collectionInfo?.address.toBase58() ==
                  web3Consts.badgeCollection.toBase58()
                ) {
                  let isCreator = false;
                  console.log("i.creators", i.creators);
                  for (let index = 0; index < i.creators.length; index++) {
                    if (
                      i.creators[index].address.toBase58() == user.toBase58()
                    ) {
                      isCreator = true;
                      break;
                    }
                  }
                  if (isCreator) {
                    continue;
                  }

                  const metadata = await this.getInvitationMetdata(i?.uri);
                  if (metadata) {
                    if (metadata.project != projectId) {
                      continue;
                    }
                  } else {
                    continue;
                  }

                  try {
                    const nftInfo: any = i;
                    console.log(
                      "token address ",
                      nftInfo.mintAddress.toBase58()
                    );
                    const activationTokenState =
                      this.__getActivationTokenStateAccount(
                        nftInfo.mintAddress
                      );
                    const activationTokenStateInfo =
                      await this.program.account.activationTokenState.fetch(
                        activationTokenState
                      );
                    console.log(
                      "activationTokenStateInfo ",
                      activationTokenStateInfo
                    );
                    const parentProfile =
                      activationTokenStateInfo.parentProfile;

                    activationTokens.push({
                      name: i.name,
                      genesis: parentProfile.toBase58(),
                      activation: nftInfo.mintAddress.toBase58(),
                    });

                    const generationData =
                      await this.getProfileChilds(parentProfile);
                    totalChild = generationData.totalChild;
                    generation = generationData.generation;
                    profilelineage =
                      await this.getProfileLineage(parentProfile);
                  } catch (error) {
                    console.log("error invite ", error);
                  }
                }
                if (activationTokens.length > 0) {
                  break;
                }
              }
            }
          }
        }
      }
      const profileInfo = {
        profiles,
        activationTokens,
        activationTokenBalance,
        totalChild: totalChild,
        profilelineage,
        generation,
        invitationPrice: mainStateInfo.invitationMintingCost.toNumber(),
        mintPrice: mainStateInfo.profileMintingCost.toNumber(),
      };
      console.log("projectInfo", profileInfo);
      return profileInfo;
    } catch (error) {
      console.log("error profile", error);
      const profiles: any = [];
      const profileInfo = {
        profiles: profiles,
        activationTokens: profiles,
        activationTokenBalance: 0,
        totalChild: 0,
        profilelineage,
        generation,
        invitationPrice: 0,
        mintPrice: 0,
      };
      return profileInfo;
    }
  }

  async createLaunchPass(input: {
    redeemAmount: number;
    redeemDate: number;
    cost: number;
    distribution: MintingCostDistribution;
    name: string;
    symbol: string;
    uri: string;
  }): Promise<string> {
    let { redeemAmount, redeemDate, cost, distribution, name, symbol, uri } =
      input;
    const targetMintKeypair = web3.Keypair.generate();

    const instructions: anchor.web3.TransactionInstruction[] = [];

    const launchPass = web3.PublicKey.findProgramAddressSync(
      [
        web3Consts.Seeds.launchPass,
        this.provider.publicKey.toBuffer(),
        targetMintKeypair.publicKey.toBuffer(),
      ],
      this.programId
    )[0];

    console.log("input ", input);

    const mintMetadata = BaseMpl.getMetadataAccount(
      targetMintKeypair.publicKey
    );

    const ix = await this.program.methods
      .initLaunchPass(
        new BN(redeemAmount),
        new BN(redeemDate),
        new BN(cost),
        distribution,
        name,
        symbol,
        uri
      )
      .accounts({
        owner: this.provider.publicKey,
        mint: targetMintKeypair.publicKey,
        launchPass,
        mintMetadata,
        sysvarInstructions,
        mplProgram,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .instruction();

    instructions.push(ix);

    const tx = new web3.Transaction().add(...instructions);

    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = this.provider.publicKey;

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    tx.add(feeIns);
    const signature = await this.provider.sendAndConfirm(tx, [
      targetMintKeypair,
    ]);

    return targetMintKeypair.publicKey.toBase58();
  }

  async buyLaunchPass(input: {
    owner: anchor.web3.PublicKey;
    mint: anchor.web3.PublicKey;
    gensis: anchor.web3.PublicKey;
  }): Promise<string> {
    let { owner, mint, gensis } = input;

    const instructions: anchor.web3.TransactionInstruction[] = [];

    const receiverAtaResult = await this.getAtaAccount(
      mint,
      this.provider.publicKey
    );
    const receiverAta = receiverAtaResult.ata;
    if (receiverAtaResult.initAtaIx)
      instructions.push(receiverAtaResult.initAtaIx);

    const ownerAtaResult = await this.getAtaAccount(
      web3Consts.usdcToken,
      owner
    );
    const ownerAta = ownerAtaResult.ata;
    if (ownerAtaResult.initAtaIx) instructions.push(ownerAtaResult.initAtaIx);

    const senderAtaResult = await this.getAtaAccount(
      web3Consts.usdcToken,
      this.provider.publicKey
    );
    const senderAta = senderAtaResult.ata;
    if (senderAtaResult.initAtaIx) instructions.push(senderAtaResult.initAtaIx);

    const launcPassState = web3.PublicKey.findProgramAddressSync(
      [web3Consts.Seeds.launchPass, owner.toBuffer(), mint.toBuffer()],
      this.programId
    )[0];

    const profileState = this.__getProfileStateAccount(gensis);
    const profileStateInfo: any =
      await this.program.account.profileState.fetch(profileState);

    const mainStateInfo = await this.program.account.mainState.fetch(
      this.mainState
    );

    const launcPassStateInfo =
      await this.program.account.launchPassState.fetch(launcPassState);

    const {
      parentProfile,
      grandParentProfile,
      currentGrandParentProfileHolder,
      currentParentProfileHolder,
      currentParentProfileHolderAta,
      currentGrandParentProfileHolderAta,
      parentProfileHolderOposAta,
      grandParentProfileHolderOposAta,
    } = await this.__getProfileHoldersInfo(
      profileStateInfo.lineage,
      gensis,
      mainStateInfo.genesisProfile,
      web3Consts.usdcToken
    );

    let cost = launcPassStateInfo.cost.toNumber();

    let holdersfullInfo = [];
    let finalRoyalties =
      cost * (launcPassStateInfo.distribution.parent / 100 / 100) +
      cost * (launcPassStateInfo.distribution.grandParent / 100 / 100);

    holdersfullInfo.push({
      receiver: launcPassStateInfo.owner,
      vallue: cost - finalRoyalties,
    });

    holdersfullInfo.push({
      receiver: currentParentProfileHolder.toBase58(),
      vallue: cost * (launcPassStateInfo.distribution.parent / 100 / 100),
    });

    holdersfullInfo.push({
      receiver: currentGrandParentProfileHolder.toBase58(),
      vallue: cost * (launcPassStateInfo.distribution.grandParent / 100 / 100),
    });

    var holdermap: any = [];
    holdersfullInfo.reduce(function (res: any, value: any) {
      if (!res[value.receiver]) {
        res[value.receiver] = { receiver: value.receiver, vallue: 0 };
        holdermap.push(res[value.receiver]);
      }
      res[value.receiver].vallue += value.vallue;
      return res;
    }, {});

    console.log("holdermap ", holdermap);

    for (let index = 0; index < holdermap.length; index++) {
      const element = holdermap[index];
      let createShare: any = await this.baseSpl.transfer_token_modified({
        mint: web3Consts.usdcToken,
        sender: this.provider.publicKey,
        receiver: new anchor.web3.PublicKey(element.receiver),
        init_if_needed: true,
        amount: Math.ceil(element.vallue),
      });
      for (let index = 0; index < createShare.length; index++) {
        instructions.push(createShare[index]);
      }
    }

    const ix = await this.program.methods
      .buyLaunchPass()
      .accounts({
        receiver: this.provider.publicKey,
        receiverAta,
        owner,
        mint,
        launcPassState,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .instruction();

    instructions.push(ix);

    const tx = new web3.Transaction().add(...instructions);

    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = this.provider.publicKey;

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    tx.add(feeIns);
    const signature = await this.provider.sendAndConfirm(tx, []);
    await internalClient.put("/api/project/buy-pass", {
      key: mint.toBase58(),
    });
    return signature;
  }

  async redeemLaunchPass(input: {
    owner: anchor.web3.PublicKey;
    launchToken: anchor.web3.PublicKey;
    mint: anchor.web3.PublicKey;
    stakeKey: anchor.web3.PublicKey;
  }): Promise<string> {
    let { owner, mint, launchToken, stakeKey } = input;

    console.log("redeemLaunchPass 1", input);

    const instructions: anchor.web3.TransactionInstruction[] = [];

    const launcPassState = web3.PublicKey.findProgramAddressSync(
      [web3Consts.Seeds.launchPass, owner.toBuffer(), launchToken.toBuffer()],
      this.programId
    )[0];
    console.log("redeemLaunchPass 2");
    const vaultState = web3.PublicKey.findProgramAddressSync(
      [web3Consts.Seeds.vault, stakeKey.toBuffer(), mint.toBuffer()],
      this.programId
    )[0];
    console.log("redeemLaunchPass 3");
    const userLaunchTokenAtaResult = await this.getAtaAccount(
      launchToken,
      this.provider.publicKey
    );
    const userLaunchTokenAta = userLaunchTokenAtaResult.ata;
    if (userLaunchTokenAtaResult.initAtaIx)
      instructions.push(userLaunchTokenAtaResult.initAtaIx);

    console.log("redeemLaunchPass 4");
    const receiverAtaResult = await this.getAtaAccount(
      mint,
      this.provider.publicKey
    );
    const receiverAta = receiverAtaResult.ata;
    if (receiverAtaResult.initAtaIx)
      instructions.push(receiverAtaResult.initAtaIx);
    console.log("redeemLaunchPass 5");
    const nftTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultState,
      true
    );

    console.log("redeemLaunchPass 6");
    const ix = await this.program.methods
      .redeemLaunchPass()
      .accounts({
        user: this.provider.publicKey,
        owner,
        launchToken,
        launcPassState,
        stakeKey,
        vault: vaultState,
        userLaunchTokenAta,
        sysvarInstructions,
        receiverAta,
        mint,
        tokenAccount: nftTokenAccount,
        mplProgram,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .instruction();

    instructions.push(ix);

    const tx = new web3.Transaction().add(...instructions);

    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = this.provider.publicKey;

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    tx.add(feeIns);
    const signature = await this.provider.sendAndConfirm(tx, []);

    return signature;
  }

  async createCoin(
    name: any,
    symbol: any,
    url: any,
    amount: number,
    decimals: number
  ): Promise<string> {
    const lamports = await getMinimumBalanceForRentExemptAccount(
      this.connection
    );

    const targetMintKeypair = web3.Keypair.generate();

    const instructions: anchor.web3.TransactionInstruction[] = [];

    instructions.push(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: this.provider.publicKey,
        newAccountPubkey: targetMintKeypair.publicKey,
        space: MINT_SIZE,
        lamports: lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        targetMintKeypair.publicKey,
        decimals,
        this.provider.publicKey,
        this.provider.publicKey,
        TOKEN_PROGRAM_ID
      )
    );

    const { ata, ix: initAtaIx } =
      await this.baseSpl.__getOrCreateTokenAccountInstruction(
        {
          mint: targetMintKeypair.publicKey,
          owner: this.provider.publicKey,
        },
        this.ixCallBack
      );
    if (initAtaIx) instructions.push(initAtaIx);

    const ix = createMintToInstruction(
      targetMintKeypair.publicKey,
      ata,
      this.provider.publicKey,
      amount
    );
    instructions.push(ix);

    const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
      {
        metadata: anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            PROGRAM_ID.toBuffer(),
            targetMintKeypair.publicKey.toBuffer(),
          ],
          PROGRAM_ID
        )[0],
        mint: targetMintKeypair.publicKey,
        mintAuthority: this.provider.publicKey,
        payer: this.provider.publicKey,
        updateAuthority: this.provider.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: name,
            symbol: symbol,
            uri: url,
            creators: null,
            sellerFeeBasisPoints: 0,
            uses: null,
            collection: null,
          },
          isMutable: false,
          collectionDetails: null,
        },
      }
    );

    instructions.push(createMetadataInstruction);

    const tx = new web3.Transaction().add(...instructions);
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = this.provider.publicKey;

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    tx.add(feeIns);
    const signature = await this.provider.sendAndConfirm(tx, [
      targetMintKeypair,
    ]);

    return targetMintKeypair.publicKey.toBase58();
  }

  async stakeCoin(
    element: any,
    connection: ConnectionContextState
  ): Promise<string> {
    const instructions: anchor.web3.TransactionInstruction[] = [];

    console.log("stakecoin 1", element);

    const vaultState = web3.PublicKey.findProgramAddressSync(
      [
        web3Consts.Seeds.vault,
        this.provider.publicKey.toBuffer(),
        element.mint.toBuffer(),
      ],
      this.programId
    )[0];
    console.log("stakecoin 2");

    const nftTokenAccount = await getAssociatedTokenAddress(
      element.mint,
      vaultState,
      true
    );

    const ownerAta = getAssociatedTokenAddressSync(
      element.mint,
      this.provider.publicKey
    );

    console.log("stakecoin 4", vaultState.toBase58());
    let vaultInfo;
    try {
      vaultInfo = await this.program.account.vaultState.fetch(vaultState);
    } catch (error) {
      console.log("error ", error);
    }

    if (vaultInfo) {
      console.log("stakecoin 5 1");
      const ix1 = await this.program.methods
        .stakeVault(new BN(element.value))
        .accounts({
          owner: this.provider.publicKey,
          ownerAta,
          mint: element.mint,
          stakeKey: this.provider.publicKey,
          vault: vaultState,
          tokenAccount: nftTokenAccount,
          associatedTokenProgram,
          systemProgram,
          tokenProgram,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .instruction();
      instructions.push(ix1);
    } else {
      console.log("stakecoin 5 2");
      const ix1 = await this.program.methods
        .initVault(new BN(element.duration), new BN(element.value))
        .accounts({
          owner: this.provider.publicKey,
          ownerAta,
          mint: element.mint,
          stakeKey: this.provider.publicKey,
          vault: vaultState,
          authority: new anchor.web3.PublicKey(
            process.env.NEXT_PUBLIC_PTV_WALLET_KEY!
          ),
          tokenAccount: nftTokenAccount,
          associatedTokenProgram,
          systemProgram,
          tokenProgram,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .instruction();
      instructions.push(ix1);
    }

    const tx = new web3.Transaction().add(...instructions);

    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = new anchor.web3.PublicKey(
      process.env.NEXT_PUBLIC_PTV_WALLET_KEY || ""
    );

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    tx.add(feeIns);
    console.log("stakecoin 6");
    console.log("send adn confirm from the stakeCoin");
    const signedTx = await this.provider.wallet.signTransaction(tx as any);
    const signature = await connection.sendAndConfirm(
      signedTx as any,
      this.provider.wallet.publicKey.toBase58()
    );

    console.log(
      signature,
      "signature from the stake coinn ======================"
    );
    // const signature = await this.provider.sendAndConfirm(tx, []);

    return signature;
  }

  async getStakeBalance(mint: any): Promise<number> {
    const vaultState = web3.PublicKey.findProgramAddressSync(
      [
        web3Consts.Seeds.vault,
        this.provider.publicKey.toBuffer(),
        mint.toBuffer(),
      ],
      this.programId
    )[0];

    const nftTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultState,
      true
    );

    try {
      const infoes =
        await this.connection.getTokenAccountBalance(nftTokenAccount);
      console.log("getStakeBalance ", infoes);
      return infoes.value.uiAmount ? infoes.value.uiAmount : 0;
    } catch (error) {
      return 0;
    }
  }

  async unStakeCoin(input: {
    amount: number;
    mint: anchor.web3.PublicKey;
    stakeKey: anchor.web3.PublicKey;
  }): Promise<string> {
    let { mint, stakeKey, amount } = input;

    const instructions: anchor.web3.TransactionInstruction[] = [];

    const vaultState = web3.PublicKey.findProgramAddressSync(
      [web3Consts.Seeds.vault, stakeKey.toBuffer(), mint.toBuffer()],
      this.programId
    )[0];

    const receiverAtaResult = await this.getAtaAccount(
      mint,
      this.provider.publicKey
    );
    const receiverAta = receiverAtaResult.ata;
    if (receiverAtaResult.initAtaIx)
      instructions.push(receiverAtaResult.initAtaIx);

    const nftTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultState,
      true
    );

    const ix = await this.program.methods
      .unstakeVault(new BN(amount))
      .accounts({
        receiver: this.provider.publicKey,
        receiverAta,
        mint,
        stakeKey,
        vault: vaultState,
        tokenAccount: nftTokenAccount,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .instruction();

    instructions.push(ix);

    const tx = new web3.Transaction().add(...instructions);

    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = this.provider.publicKey;

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    tx.add(feeIns);
    const signature = await this.provider.sendAndConfirm(tx, []);
    return signature;
  }

  async unStakeToken(input: {
    amount: number;
    mint: anchor.web3.PublicKey;
    stakeKey: anchor.web3.PublicKey;
  }): Promise<string> {
    let { mint, stakeKey, amount } = input;

    const instructions: anchor.web3.TransactionInstruction[] = [];

    const vaultState = web3.PublicKey.findProgramAddressSync(
      [web3Consts.Seeds.vault, stakeKey.toBuffer(), mint.toBuffer()],
      this.programId
    )[0];

    const receiverAtaResult = await this.getAtaAccount(
      mint,
      this.provider.publicKey
    );
    const receiverAta = receiverAtaResult.ata;
    if (receiverAtaResult.initAtaIx)
      instructions.push(receiverAtaResult.initAtaIx);

    const nftTokenAccount = await getAssociatedTokenAddress(
      mint,
      vaultState,
      true
    );

    const receiverAccount = await this.getAtaAccount(mint, stakeKey);
    if (!receiverAccount) {
      const targetMintKeypair = web3.Keypair.generate();
      const tokenATA = await getAssociatedTokenAddress(
        targetMintKeypair.publicKey,
        stakeKey
      );
      instructions.push(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          targetMintKeypair.publicKey,
          tokenATA,
          stakeKey,
          stakeKey
        )
      );
    }

    const ix = await this.program.methods
      .unstakeVault(new BN(amount))
      .accounts({
        receiver: this.provider.publicKey,
        receiverAta,
        mint,
        stakeKey,
        vault: vaultState,
        tokenAccount: nftTokenAccount,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .instruction();

    instructions.push(ix);

    const createTransfer = await this.baseSpl.transfer_token_modified({
      mint,
      sender: this.provider.publicKey,
      receiver: stakeKey,
      init_if_needed: true,
      amount: amount,
    });

    for (let i = 0; i < createTransfer.length; i++) {
      instructions.push(createTransfer[i]);
    }

    const tx = new web3.Transaction().add(...instructions);

    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = stakeKey;

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    tx.add(feeIns);
    const signedTx = await this.provider.wallet.signTransaction(tx);
    const serializedTx = signedTx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }) as Buffer;
    return serializedTx.toString("hex");
  }

  async hasStakeAccount(stakeKey: String) {
    try {
      const result = await axios.get(
        "/api/project/hash-stake-account?key=" + stakeKey
      );
      if (result.data) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.log("hasStakeAccount error", error);
      return false;
    }
  }

  async saveStakeAccount(
    key: String,
    mint: String,
    receiver: String,
    value: number,
    expiry: number,
    staketype: number
  ) {
    try {
      const result = await internalClient.post(
        "/api/project/save-stake-account",
        {
          key,
          project: this.projectId.toBase58(),
          mint,
          receiver,
          value,
          expiry,
          staketype,
        }
      );
    } catch (error) {
      console.log("hasStakeAccount error", error);
      return null;
    }
  }

  async createWrappedSol(value: number): Promise<string> {
    let ata = await getAssociatedTokenAddress(
      NATIVE_MINT, // mint
      this.provider.publicKey // owner
    );
    const instructions: anchor.web3.TransactionInstruction[] = [];
    console.log("createWrappedSol", value);
    instructions.push(
      // trasnfer SOL
      SystemProgram.transfer({
        fromPubkey: this.provider.publicKey,
        toPubkey: ata,
        lamports: value,
      }),
      // sync wrapped SOL balance
      createSyncNativeInstruction(ata)
    );

    const tx = new web3.Transaction().add(...instructions);

    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = this.provider.publicKey;

    const feeEstimate = await this.getPriorityFeeEstimate(tx);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    tx.add(feeIns);
    const signature = await this.provider.sendAndConfirm(tx, []);

    return signature;
  }

  async getProfileMetadataByProject(uri: string) {
    try {
      const result = await axios.get(uri);

      if (result.data) {
        let userData: any = {
          seniority: "",
          project: "",
        };
        for (let index = 0; index < result.data.attributes.length; index++) {
          const element = result.data.attributes[index];
          if (element.trait_type == "Seniority") {
            userData.seniority = element.value;
          } else if (
            element.trait_type == "Project" ||
            element.trait_type == "Offer"
          ) {
            userData.project = element.value;
          }
        }
        return userData;
      } else {
        return null;
      }
    } catch (error) {
      console.log("metadata error", error);
      return null;
    }
  }

  async getInvitationMetdataForProject(uri: string) {
    try {
      const result = await axios.get(uri);
      if (result.data) {
        let userData: any = {
          project: "",
        };
        for (let index = 0; index < result.data.attributes.length; index++) {
          const element = result.data.attributes[index];
          if (
            element.trait_type == "Project" ||
            element.trait_type == "Offer"
          ) {
            userData.project = element.value;
          }
        }
        return userData;
      } else {
        return null;
      }
    } catch (error) {
      console.log("metadata error", error);
      return null;
    }
  }

  async getProjectUserInfo(projectId: String) {
    const user = this.provider.publicKey;
    if (!user) throw "Wallet not found";

    let profilelineage = {
      promoter: "",
      promoterprofile: "",
      scout: "",
      scoutprofile: "",
      recruiter: "",
      recruiterprofile: "",
      originator: "",
      originatorprofile: "",
    };
    let generation = "0";

    try {
      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );
      console.log("mainStateInfo ", mainStateInfo);
      const passCollection = web3Consts.passCollection;

      const _userNfts = await this.getUserNFTs(user.toBase58());

      let activationTokenBalance: any = 0;
      let profiles: any = [];
      const activationTokens = [];
      let totalChild = 0;
      let seniority = 0;
      for (let i of _userNfts) {
        const nftInfo: any = i;
        const collectionInfo = i?.collection;
        if (collectionInfo?.address.toBase58() == passCollection.toBase58()) {
          const metadata = await this.getProfileMetadataByProject(i?.uri);
          console.log("metadata", metadata);
          if (metadata) {
            if (metadata.project == projectId) {
              if (seniority == 0 || seniority > metadata.seniority) {
                profiles = [
                  {
                    name: i.name,
                    address: nftInfo.mintAddress.toBase58(),
                    userinfo: metadata,
                  },
                ];
                seniority = metadata.seniority;
              }
            }
          }
        }
      }

      if (profiles.length > 0) {
        const genesisProfile = new anchor.web3.PublicKey(profiles[0].address);
        const profileState = this.__getProfileStateAccount(genesisProfile);
        const profileStateInfo: any =
          await this.program.account.profileState.fetch(profileState);
        console.log("profileStateInfo ", profileStateInfo);
        let hasInvitation: any = false;
        if (profileStateInfo.activationToken) {
          hasInvitation = await this.isCreatorInvitation(
            profileStateInfo.activationToken,
            user.toBase58()
          );
          console.log("hasInvitation ", hasInvitation);
          if (hasInvitation) {
            const userActivationAta = getAssociatedTokenAddressSync(
              profileStateInfo.activationToken,
              user
            );
            activationTokenBalance = await this.getActivationTokenBalance(
              profileStateInfo.activationToken
            );
          }
        }
        totalChild = profileStateInfo.lineage.totalChild.toNumber();
        generation = profileStateInfo.lineage.generation.toString();

        for (let i of _userNfts) {
          const collectionInfo = i?.collection;
          if (
            collectionInfo?.address.toBase58() ==
              web3Consts.badgeCollection.toBase58() &&
            hasInvitation &&
            i?.mintAddress == profileStateInfo.activationToken.toBase58()
          ) {
            activationTokens.push({
              name: i.name,
              genesis: genesisProfile.toBase58(),
              activation: hasInvitation
                ? profileStateInfo.activationToken.toBase58()
                : "",
            });
          }
        }

        if (this.getAddressString(profileState) != "") {
          const {
            parentProfile,
            grandParentProfile,
            greatGrandParentProfile,
            ggreateGrandParentProfile,
            currentGreatGrandParentProfileHolder,
            currentGgreatGrandParentProfileHolder,
            currentGrandParentProfileHolder,
            currentParentProfileHolder,
          } = await this.__getProfileHoldersInfo(
            profileStateInfo.lineage,
            genesisProfile,
            mainStateInfo.genesisProfile,
            mainStateInfo.oposToken
          );
          profilelineage = {
            promoter: this.getAddressString(currentParentProfileHolder),
            promoterprofile: this.getAddressString(parentProfile),
            scout: this.getAddressString(currentGrandParentProfileHolder),
            scoutprofile: this.getAddressString(grandParentProfile),
            recruiter: this.getAddressString(
              currentGreatGrandParentProfileHolder
            ),
            recruiterprofile: this.getAddressString(greatGrandParentProfile),
            originator: this.getAddressString(
              currentGgreatGrandParentProfileHolder
            ),
            originatorprofile: this.getAddressString(ggreateGrandParentProfile),
          };
        }
      } else {
        for (let i of _userNfts) {
          if (i) {
            if (i.symbol) {
              const collectionInfo = i?.collection;
              if (
                collectionInfo?.address.toBase58() ==
                web3Consts.badgeCollection.toBase58()
              ) {
                let isCreator = false;
                console.log("i.creators", i.creators);
                for (let index = 0; index < i.creators.length; index++) {
                  if (i.creators[index].address.toBase58() == user.toBase58()) {
                    isCreator = true;
                    break;
                  }
                }
                if (isCreator) {
                  continue;
                }

                const metadata = await this.getInvitationMetdataForProject(
                  i?.uri
                );
                console.log("metadata ", metadata);
                if (metadata) {
                  if (metadata.project != projectId) {
                    continue;
                  }
                } else {
                  continue;
                }

                try {
                  const nftInfo: any = i;
                  console.log("token address ", nftInfo.mintAddress.toBase58());
                  const activationTokenState =
                    this.__getActivationTokenStateAccount(nftInfo.mintAddress);
                  const activationTokenStateInfo =
                    await this.program.account.activationTokenState.fetch(
                      activationTokenState
                    );
                  console.log(
                    "activationTokenStateInfo ",
                    activationTokenStateInfo
                  );
                  const parentProfile = activationTokenStateInfo.parentProfile;

                  activationTokens.push({
                    name: i.name,
                    genesis: parentProfile.toBase58(),
                    activation: nftInfo.mintAddress.toBase58(),
                  });

                  const generationData =
                    await this.getProfileChilds(parentProfile);
                  totalChild = generationData.totalChild;
                  generation = generationData.generation;
                  profilelineage = await this.getProfileLineage(parentProfile);
                } catch (error) {
                  console.log("error invite ", error);
                }
              }
              if (activationTokens.length > 0) {
                break;
              }
            }
          }
        }
      }
      const profileInfo = {
        profiles,
        activationTokens,
        activationTokenBalance,
        totalChild: totalChild,
        profilelineage,
        generation,
        invitationPrice: mainStateInfo.invitationMintingCost.toNumber(),
        mintPrice: mainStateInfo.profileMintingCost.toNumber(),
      };
      console.log("projectInfo", profileInfo);
      return profileInfo;
    } catch (error) {
      console.log("error profile", error);
      const profiles: any = [];
      const profileInfo = {
        profiles: profiles,
        activationTokens: profiles,
        activationTokenBalance: 0,
        totalChild: 0,
        profilelineage,
        generation,
        invitationPrice: 0,
        mintPrice: 0,
      };
      return profileInfo;
    }
  }

  async getAtaAccount(
    mint: anchor.web3.PublicKey,
    owner: anchor.web3.PublicKey
  ) {
    const { ata, ix: initAtaIx } =
      await this.baseSpl.__getOrCreateTokenAccountInstruction(
        {
          mint: mint,
          owner: owner,
        },
        this.ixCallBack
      );

    return {
      ata,
      initAtaIx,
    };
  }
}
