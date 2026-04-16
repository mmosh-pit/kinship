import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { IDL, Mmoshforge } from "./mmoshforge";
import {
  LineageInfo,
  Result,
  TxPassType,
  _MintGuestPass,
  _MintProfile,
  _MintProfileByAtInput,
  _MintProfileInput,
  _MintSubscriptionToken,
  _RegisterCommonLut,
} from "./web3Types";
import Config from "./web3Config.json";
import { BaseMpl } from "./base/baseMpl";
import { web3Consts } from "./web3Consts";
import { getAssociatedTokenAddressSync, unpackAccount } from "forge-spl-token";
import { Metaplex, PublicKey } from "@metaplex-foundation/js";
import { BaseSpl, UpdateToken } from "./base/baseSpl";
import axios from "axios";
import { getAccount } from "forge-spl-token";
import { createBurnInstruction } from "forge-spl-token";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import { getLineage } from "@/app/(main)/lib/forge/createProfile";

const {
  systemProgram,
  associatedTokenProgram,
  mplProgram,
  tokenProgram,
  sysvarInstructions,
  Seeds,
  oposToken,
  usdcToken,
  LAMPORTS_PER_OPOS,
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
  connection: web3.Connection;
  metaplex: Metaplex;
  baseSpl: BaseSpl;

  constructor(provider: AnchorProvider, programId: web3.PublicKey) {
    this.provider = provider;
    this.connection = provider.connection;
    this.programId = programId;
    this.program = new Program(IDL, this.provider);
    this.metaplex = new Metaplex(this.connection);
    this.baseSpl = new BaseSpl(this.connection);
    this.mainState = web3.PublicKey.findProgramAddressSync(
      [Seeds.mainState],
      this.programId
    )[0];
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
  __getValutAccount(profile: web3.PublicKey): web3.PublicKey {
    return web3.PublicKey.findProgramAddressSync(
      [Seeds.vault, profile.toBuffer()],
      this.programId
    )[0];
  }

  async getProfileMetadata(uri: string) {
    try {
      const result = await axios.get(uri);
      if (result.data) {
        let userData: any = {
          _id: "",
          wallet: "",
          username: "",
          bio: result.data.description,
          pronouns: "",
          name: result.data.name,
          image: result.data.image,
          descriptor: "",
          nouns: "",
          seniority: "",
          project: "",
        };
        for (let index = 0; index < result.data.attributes.length; index++) {
          const element = result.data.attributes[index];
          if (element.trait_type == "Seniority") {
            userData.seniority = element.value;
          } else if (element.trait_type == "Username") {
            userData.username = element.value;
          } else if (element.trait_type == "Full Name") {
            userData.name = element.value;
          } else if (element.trait_type == "Adjective") {
            userData.descriptor = element.value;
          } else if (element.trait_type == "Noun") {
            userData.nouns = element.value;
          } else if (element.trait_type == "Pronoun") {
            userData.pronouns = element.value;
          } else if (
            element.trait_type == "Community" ||
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

  async getInvitationMetdata(uri: string) {
    try {
      const result = await axios.get(uri);
      if (result.data) {
        let userData: any = {
          project: "",
        };
        if (result.data.attributes) {
          for (let index = 0; index < result.data.attributes.length; index++) {
            const element = result.data.attributes[index];
            if (
              element.trait_type == "Community" ||
              element.trait_type == "Project" ||
              element.trait_type == "Offer"
            ) {
              userData.project = element.value;
            }
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

  async setupLookupTable(
    addresses: web3.PublicKey[] = []
  ): Promise<Result<TxPassType<{ lookupTable: string }>, any>> {
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

      const signature = await this.provider.sendAndConfirm(transaction as any);
      return {
        Ok: { signature, info: { lookupTable: lookupTableAddress.toBase58() } },
      };
    } catch (err) {
      log("Error: ", err);
      return { Err: err };
    }
  }

  async mintProfileByActivationToken(
    input: _MintProfileByAtInput
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
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

      symbol = symbol ?? "";
      uriHash = uriHash ?? "";

      const activationTokenState =
        this.__getActivationTokenStateAccount(activationToken);
      const activationTokenStateInfo =
        await this.program.account.activationTokenState.fetch(
          activationTokenState
        );
      const parentProfile = activationTokenStateInfo.parentProfile;
      const parentProfileStateInfo =
        await this.program.account.profileState.fetch(
          this.__getProfileStateAccount(parentProfile)
        );
      // const lut = parentProfileStateInfo.lut;
      const parentProfileNftInfo = await this.metaplex
        .nfts()
        .findByMint({ mintAddress: parentProfile, loadJsonMetadata: false });
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
      const profileMetadata = BaseMpl.getMetadataAccount(profile);
      const profileEdition = BaseMpl.getEditionAccount(profile);
      const profileState = this.__getProfileStateAccount(profile);
      const parentProfileState = this.__getProfileStateAccount(parentProfile);

      const {
        //profiles
        grandParentProfile,
        greatGrandParentProfile,
        ggreateGrandParentProfile,
        //
        currentGreatGrandParentProfileHolder,
        currentGgreatGrandParentProfileHolder,
        currentGrandParentProfileHolder,
        currentGenesisProfileHolder,
        currentParentProfileHolder,
      } = await this.__getProfileHoldersInfo(
        parentProfileStateInfo.lineage,
        parentProfile,
        genesisProfile
      );
      // const userOposAta = getAssociatedTokenAddressSync(oposToken, user);

      const ix = await this.program.methods
        .mintProfileByAt(name, symbol, uriHash)
        .accounts({
          profile, // 1
          user, // 2
          oposToken, // 3
          userProfileAta, // 5
          mainState: this.mainState, // 6
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

      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );
      let cost = mainStateInfo.profileMintingCost.toNumber();

      let holdersfullInfo = [];

      holdersfullInfo.push({
        receiver: currentGenesisProfileHolder.toBase58(),
        vallue:
          cost * (mainStateInfo.mintingCostDistribution.genesis / 100 / 100),
      });

      holdersfullInfo.push({
        receiver: currentParentProfileHolder.toBase58(),
        vallue:
          cost * (mainStateInfo.mintingCostDistribution.parent / 100 / 100),
      });

      holdersfullInfo.push({
        receiver: currentGrandParentProfileHolder.toBase58(),
        vallue:
          cost *
          (mainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
      });

      holdersfullInfo.push({
        receiver: currentGreatGrandParentProfileHolder.toBase58(),
        vallue:
          cost *
          (mainStateInfo.mintingCostDistribution.greatGrandParent / 100 / 100),
      });

      holdersfullInfo.push({
        receiver: currentGgreatGrandParentProfileHolder.toBase58(),
        vallue:
          cost *
          (mainStateInfo.mintingCostDistribution.ggreatGrandParent / 100 / 100),
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

      const commonLutInfo = (
        await this.connection.getAddressLookupTable(commonLut)
      ).value;

      const lutsInfo = [commonLutInfo!];

      const freezeInstructions = await this.calculatePriorityFee(
        ix,
        lutsInfo,
        mintKp
      );

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

      const tx = new web3.VersionedTransaction(message);
      tx.sign([mintKp]);
      this.txis = [];

      // const signedTx = await this.provider.wallet.signTransaction(tx as any);
      // const txLen = signedTx.serialize().length;
      // log({ txLen, luts: lutsInfo.length });

      const signature = await this.provider.sendAndConfirm(tx as any);

      await this.storeRoyalty(
        user.toBase58(),
        [
          {
            receiver: currentGenesisProfileHolder.toBase58(),
            amount: 12000,
          },
          {
            receiver: currentParentProfileHolder.toBase58(),
            amount: 4000,
          },
          {
            receiver: currentGrandParentProfileHolder.toBase58(),
            amount: 2000,
          },
          {
            receiver: currentGgreatGrandParentProfileHolder.toBase58(),
            amount: 600,
          },
        ],
        web3Consts.oposToken
      );

      await this.storeLineage(
        user.toBase58(),
        {
          promotor: parentProfile.toBase58(),
          scout: grandParentProfile.toBase58(),
          recruitor: greatGrandParentProfile.toBase58(),
          originator: ggreateGrandParentProfile.toBase58(),
          gensis: genesisProfile.toBase58(),
        },
        profile.toBase58()
      );

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

  async mintProfile(
    input: _MintProfile
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found";

      let {
        parentProfile,
        price,
        membership
      } = input;


      if (typeof parentProfile == "string")
        parentProfile = new web3.PublicKey(parentProfile);

      this.txis = [];

      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );

      let lineage = await getLineage(parentProfile.toBase58());

      let cost = price * (10 ** 6);

      let holdersfullInfo = [];

      holdersfullInfo.push({
        receiver: lineage.gensis,
        vallue:
          // cost * (mainStateInfo.mintingCostDistribution.genesis / 100 / 100),
          Math.ceil(cost * (20 / 100)),
      });

      holdersfullInfo.push({
        receiver: parentProfile.toBase58(),
        vallue:
          // cost * (mainStateInfo.mintingCostDistribution.parent / 100 / 100),
          Math.ceil(cost * (10 / 100)),
      });

      holdersfullInfo.push({
        receiver: lineage.parent,
        vallue:
          // cost *
          // (mainStateInfo.mintingCostDistribution.grandParent / 100 / 100),
          Math.ceil(cost * (5 / 100)),
      });

      holdersfullInfo.push({
        receiver: lineage.gparent,
        vallue:
          // cost *
          // (mainStateInfo.mintingCostDistribution.greatGrandParent / 100 / 100),
          Math.ceil(cost * (3 / 100)),
      });

      holdersfullInfo.push({
        receiver: lineage.ggparent,
        vallue:
          // cost *
          // (mainStateInfo.mintingCostDistribution.ggreatGrandParent / 100 / 100),
          Math.ceil(cost * (2 / 100)),
      });

      holdersfullInfo.push({
        receiver: new anchor.web3.PublicKey(
          process.env.NEXT_PUBLIC_PTV_WALLET_KEY || ""
        ).toBase58(),
        vallue:
          // cost *
          // (mainStateInfo.mintingCostDistribution.ggreatGrandParent / 100 / 100),
          Math.ceil(cost * (60 / 100)),
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
          mint: usdcToken,
          sender: user,
          receiver: new anchor.web3.PublicKey(element.receiver),
          init_if_needed: true,
          amount: Math.ceil(element.vallue),
        });
        for (let index = 0; index < createShare.length; index++) {
          this.txis.push(createShare[index]);
        }
      }

      const tx = new web3.Transaction().add(...this.txis);
      tx.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;
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

      this.txis = [];

      // const signedTx = await this.provider.wallet.signTransaction(tx as any);
      // const txLen = signedTx.serialize().length;
      // log({ txLen, luts: lutsInfo.length });

      // const signature = await this.provider.sendAndConfirm(tx, []);
      // console.log("----- PROFILE MINT SIGNATURE -----", signature);

      console.log(tx, "tx ===============================>>");
      console.log(
        this.provider.wallet.publicKey.toBase58(),
        "this.provider.wallet.publicKey.toBase58() ============>"
      );
      const signedTx = await this.provider.wallet.signTransaction(tx as any);
      console.log(signedTx, "====================>");
      const signature = await input.connection.sendAndConfirm(
        signedTx as any,
        this.provider.wallet.publicKey.toBase58()
      );

      console.log(signature, "signature ====================>");

      await this.storeRoyalty(
        user.toBase58(),
        [
          {
            receiver: lineage.gensis,
            amount: 8 * 0.2,
          },
          {
            receiver: parentProfile,
            amount: 8 * 0.1,
          },
          {
            receiver: lineage.parent,
            amount: 8 * 0.05,
          },
          {
            receiver: lineage.gparent,
            amount: 8 * 0.03,
          },
          {
            receiver: lineage.ggparent,
            amount: 8 * 0.02,
          },
        ],
        web3Consts.usdcToken
      );


      await this.storeLineage(
        user.toBase58(),
        {
          promotor: parentProfile.toBase58(),
          scout: lineage.parent,
          recruitor: lineage.gparent,
          originator: lineage.ggparent,
          gensis: process.env.NEXT_PUBLIC_GENESIS_PROFILE_HOLDER,
        },
        this.provider.publicKey.toBase58()
      );

      const saveHistoryparams = {
        transactionType: "membership_royalty",
        membershipRoyalty: {
          royalty: [
            {
              receiver: lineage.parent,
              amount: Math.ceil(cost * (20 / 100)),
              isClaimed: true,
              isUnstaked: true
            },
            {
              receiver: lineage.gparent,
              amount: Math.ceil(cost * (10 / 100)),
              isClaimed: true,
              isUnstaked: true
            },
            {
              receiver: lineage.ggparent,
              amount: Math.ceil(cost * (3 / 100)),
              isClaimed: true,
              isUnstaked: true
            },
            {
              receiver: lineage.gggparent,
              amount: Math.ceil(cost * (2 / 100)),
              isClaimed: true,
              isUnstaked: true
            },
          ],
          isStaked: false,
          isUnlocked: true,
          purchaseId: "",
        },
      };
      const res = await axios.post(`${origin}/api/history/save`, saveHistoryparams, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      console.log("----- MINT PROFILE RESPONSE CHECK -----", res);
      const lineageNotificationParams = {
        action: "became_member",
        referredUserAddress: this.provider.wallet.publicKey.toBase58(),
        referrerId: "",
        lineage: [lineage.parent, lineage.gparent, lineage.ggparent, lineage.gggparent],
        membershipType: membership
      }
      const result = await axios.post(`${origin}/api/notifications/send-lineage-notification`, lineageNotificationParams, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      return {
        Ok: {
          signature,
          info: { profile: this.provider.publicKey.toBase58() },
        },
      };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }

  async buyMembership(
    input: _MintProfile
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found";
      let {
        parentProfile,
        price,
        membership
      } = input;

      if (typeof parentProfile == "string")
        parentProfile = new web3.PublicKey(parentProfile);

      this.txis = [];

      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );
      let lineage = await getLineage(parentProfile.toBase58());
      let cost = price * 10 ** 6;

      let holdersfullInfo = [];

      holdersfullInfo.push({
        receiver: lineage.gensis,
        vallue: Math.ceil(cost * (20 / 100)),
      });

      holdersfullInfo.push({
        receiver: parentProfile.toBase58(),
        vallue: Math.ceil(cost * (10 / 100)),
      });

      holdersfullInfo.push({
        receiver: lineage.parent,
        vallue: Math.ceil(cost * (5 / 100)),
      });

      holdersfullInfo.push({
        receiver: lineage.gparent,
        vallue:
          Math.ceil(cost * (3 / 100)),
      });

      holdersfullInfo.push({
        receiver: lineage.ggparent,
        vallue: Math.ceil(cost * (2 / 100)),
      });

      holdersfullInfo.push({
        receiver: new anchor.web3.PublicKey(
          process.env.NEXT_PUBLIC_PTV_WALLET_KEY || ""
        ).toBase58(),
        vallue:
          // cost *
          // (mainStateInfo.mintingCostDistribution.ggreatGrandParent / 100 / 100),
          Math.ceil(cost * (60 / 100)),
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
          mint: usdcToken,
          sender: user,
          receiver: new anchor.web3.PublicKey(element.receiver),
          init_if_needed: true,
          amount: Math.ceil(element.vallue),
        });
        for (let index = 0; index < createShare.length; index++) {
          this.txis.push(createShare[index]);
        }
      }

      const transaction = new web3.Transaction().add(...this.txis);
      transaction.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;
      transaction.feePayer = new anchor.web3.PublicKey(
        process.env.NEXT_PUBLIC_PTV_WALLET_KEY || ""
      );
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
      // const signature = await this.provider.sendAndConfirm(transaction, []);
      const signedTx = await this.provider.wallet.signTransaction(
        transaction as any
      );
      console.log(signedTx, "signed tx ================================>>");
      const signature = await input.connection.sendAndConfirm(
        signedTx as any,
        this.provider.wallet.publicKey.toBase58()
      );

      console.log(signature, "signature ================================>");
      const saveHistoryparams = {
        transactionType: "membership_royalty",
        membershipRoyalty: {
          royalty: [
            {
              receiver: lineage.parent,
              amount: Math.ceil(cost * (20 / 100)),
              isClaimed: true,
              isUnstaked: true
            },
            {
              receiver: lineage.gparent,
              amount: Math.ceil(cost * (10 / 100)),
              isClaimed: true,
              isUnstaked: true
            },
            {
              receiver: lineage.ggparent,
              amount: Math.ceil(cost * (3 / 100)),
              isClaimed: true,
              isUnstaked: true
            },
            {
              receiver: lineage.gggparent,
              amount: Math.ceil(cost * (2 / 100)),
              isClaimed: true,
              isUnstaked: true
            },
          ],
          isStaked: false,
          isUnlocked: true,
          purchaseId: "",
        },
      };
      const res = await axios.post(`${origin}/api/history/save`, saveHistoryparams, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      console.log("----- MINT PROFILE RESPONSE CHECK -----", res);
      const lineageNotificationParams = {
        action: "membership_change",
        referredUserAddress: this.provider.wallet.publicKey.toBase58(),
        referrerId: "",
        lineage: [lineage.parent, lineage.gparent, lineage.ggparent, lineage.gggparent],
        membershipType: membership
      }
      const result = await axios.post(`${origin}/api/notifications/send-lineage-notification`, lineageNotificationParams, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return {
        Ok: {
          signature: signature,
          info: { profile: "" },
        },
      };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }
  async trasferUsdCoin(
    input: {
      recipient: { receiver: string; amount: number },
      sender: PublicKey
    }
  ): Promise<Result<TxPassType<{ txSignature: string }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found";

      const { recipient, sender } = input;
      this.txis = [];

      const createTransfer = await this.baseSpl.transfer_token_modified({
        mint: usdcToken,
        sender: new anchor.web3.PublicKey(sender),
        receiver: new anchor.web3.PublicKey(recipient.receiver),
        init_if_needed: true,
        amount: Math.ceil(recipient.amount * (10 ** 6)),
      });

      for (let i = 0; i < createTransfer.length; i++) {
        this.txis.push(createTransfer[i]);
      }

      const blockhash = (await this.connection.getLatestBlockhash()).blockhash;
      const message = new web3.TransactionMessage({
        payerKey: this.provider.publicKey,
        recentBlockhash: blockhash,
        instructions: [...this.txis],
      }).compileToV0Message();

      const tx = new web3.VersionedTransaction(message);
      const signature = await this.provider.sendAndConfirm(tx as any);
      console.log("===== SIGNATURE =====", signature);

      return {
        Ok: {
          signature,
          info: { txSignature: signature },
        },
      };
    } catch (error) {
      console.log("===== ERROR =====", error);
      // console.error({ error });
      return { Err: error };
    }
  }

  async registerCommonLut() {
    const collection = web3Consts.profileCollection;
    const collectionMetadata = BaseMpl.getMetadataAccount(collection);
    const collectionEdition = BaseMpl.getEditionAccount(collection);
    const lookupResult = await this.setupLookupTable([
      oposToken, // 1
      this.mainState, // 2
      collection, // 3
      mplProgram, // 4
      tokenProgram, // 5
      systemProgram, // 6
      collectionEdition, // 7
      collectionMetadata, // 8
      sysvarInstructions, // 9
      associatedTokenProgram, // 10
    ]);
  }

  async storeRoyalty(sender: string, receivers: any, coin: any, token?: string) {
    if (token) {
      await axios.post(process.env.NEXT_PUBLIC_APP_MAIN_URL + "/api/update-royalty", {
        sender,
        receivers,
        coin,
      }, {
        headers: {
          authorization: token
        }
      })
    } else {
      await internalClient.post("/api/update-royalty", {
        sender,
        receivers,
        coin,
      });
    }
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
      return Math.floor(data.result.priorityFeeEstimate);
    } catch (error) {
      console.log("getPriorityFeeEstimate ", error);
      return 0;
    }
  }

  async storeLineage(wallet: string, lineage: any, profile: string, token?: string) {
    if (token) {
      await axios.post(process.env.NEXT_PUBLIC_APP_MAIN_URL + "/api/save-lineage", {
        wallet,
        lineage,
        profile
      }, {
        headers: {
          authorization: token
        }
      })
    } else {
      await internalClient.post("/api/save-lineage", {
        wallet,
        lineage,
        profile,
      });
    }
  }

  async initSubscriptionBadge(input: {
    profile: web3.PublicKey | string;
    name: string;
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

      // const mainStateInfo = await this.program.account.mainState.fetch(
      //   this.mainState,
      // );
      const parentCollection = web3Consts.badgeCollection;
      const parentCollectionMetadata =
        BaseMpl.getMetadataAccount(parentCollection);
      const parentCollectionEdition =
        BaseMpl.getEditionAccount(parentCollection);

      const ix = await this.program.methods
        .initActivationToken(name, symbol, uri)
        .accounts({
          profile,
          mainState: this.mainState,
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

  async mintSubscriptionToken(
    input: _MintSubscriptionToken
  ): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      const user = this.provider.publicKey;
      if (!user) throw "Wallet not found";
      let { subscriptionToken, receiver, parentProfile, amount } = input;
      amount = amount ?? 1;

      let subscriptionTokenState: web3.PublicKey;
      if (!subscriptionToken) {
        if (!parentProfile) throw "Parent Profile not found";
        if (typeof parentProfile == "string")
          parentProfile = new web3.PublicKey(parentProfile);
        const parentProfileStateInfoData =
          await this.program.account.profileState.fetch(
            this.__getProfileStateAccount(parentProfile)
          );
        subscriptionToken = parentProfileStateInfoData.activationToken!;
        if (!subscriptionToken) throw "Subscription Token not initialised";
        subscriptionTokenState =
          this.__getActivationTokenStateAccount(subscriptionToken);
      } else {
        if (typeof subscriptionToken == "string")
          subscriptionToken = new web3.PublicKey(subscriptionToken);
        subscriptionTokenState =
          this.__getActivationTokenStateAccount(subscriptionToken);
      }

      const activationTokenStateInfo =
        await this.program.account.activationTokenState.fetch(
          subscriptionTokenState
        );
      parentProfile = activationTokenStateInfo.parentProfile;
      const parentProfileState = this.__getProfileStateAccount(parentProfile);
      let parentProfileStateInfo =
        await this.program.account.profileState.fetch(parentProfileState);

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

      const mainStateInfo = await this.program.account.mainState.fetch(
        this.mainState
      );
      const profileCollection = mainStateInfo.profileCollection;
      const profileCollectionState =
        await this.program.account.collectionState.fetch(
          this.__getCollectionStateAccount(profileCollection)
        );
      const genesisProfile = profileCollectionState.genesisProfile;

      const {
        //profiles
        // genesisProfile,
        // parentProfile,
        grandParentProfile,
        greatGrandParentProfile,
        ggreateGrandParentProfile,
        //
        currentGreatGrandParentProfileHolder,
        currentGgreatGrandParentProfileHolder,
        currentGrandParentProfileHolder,
        currentGenesisProfileHolder,
        currentParentProfileHolder,
        //
        currentParentProfileHolderAta,
        currentGenesisProfileHolderAta,
        currentGrandParentProfileHolderAta,
        currentGreatGrandParentProfileHolderAta,
        currentGgreatGrandParentProfileHolderAta,
        //
        parentProfileHolderOposAta,
        genesisProfileHolderOposAta,
        grandParentProfileHolderOposAta,
        greatGrandParentProfileHolderOposAta,
        ggreatGrandParentProfileHolderOposAta,
      } = await this.__getProfileHoldersInfo(
        parentProfileStateInfo.lineage,
        parentProfile,
        genesisProfile
      );

      const userOposAta = getAssociatedTokenAddressSync(oposToken, user);

      const ix = await this.program.methods
        .mintActivationToken(new BN(amount))
        .accounts({
          activationTokenState: subscriptionTokenState,
          tokenProgram,
          activationToken: subscriptionToken,
          profile: parentProfile,
          profileState,
          minterProfileAta,
          mainState: this.mainState,
          minter: user,
          receiverAta,
          //NOTE: Profile minting cost distributaion account
          oposToken,
          systemProgram,
          associatedTokenProgram,
          userOposAta,
          parentProfileState,

          //Profiles
          parentProfile,
          genesisProfile,
          grandParentProfile,
          greatGrandParentProfile,
          ggreateGrandParentProfile,

          //verification ata
          currentParentProfileHolderAta,
          currentGrandParentProfileHolderAta,
          currentGreatGrandParentProfileHolderAta,
          currentGgreatGrandParentProfileHolderAta,
          currentGenesisProfileHolderAta,
          // profile owners
          currentParentProfileHolder,
          currentGrandParentProfileHolder,
          currentGreatGrandParentProfileHolder,
          currentGgreatGrandParentProfileHolder,
          currentGenesisProfileHolder,

          // holder opos ata
          parentProfileHolderOposAta,
          grandParentProfileHolderOposAta,
          greatGrandParentProfileHolderOposAta,
          ggreatGrandParentProfileHolderOposAta,
          genesisProfileHolderOposAta,
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
      await this.storeRoyalty(
        user.toBase58(),
        [
          {
            receiver: currentGenesisProfileHolder.toBase58(),
            amount: Number(amount),
          },
        ],
        web3Consts.oposToken
      );
      return { Ok: { signature, info: {} } };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
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

  async isCreatorInvitation(mintAddress: web3.PublicKey, userAddress: string) {
    try {
      const mintData = await this.metaplex.nfts().findByMint({ mintAddress });
      if (
        mintData.collection?.address.toBase58() !=
        web3Consts.badgeCollection.toBase58()
      ) {
        return false;
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

  async getUserInfo() {
    const user = this.provider.publicKey;
    if (!user) throw "Wallet not found";
    const userOposAta = getAssociatedTokenAddressSync(oposToken, user);
    const userUSDCAta = getAssociatedTokenAddressSync(usdcToken, user);
    const infoes = await this.connection.getMultipleAccountsInfo([
      new anchor.web3.PublicKey(user.toBase58()),
      new anchor.web3.PublicKey(userOposAta.toBase58()),
      new anchor.web3.PublicKey(userUSDCAta.toBase58()),
    ]);
    let oposTokenBalance = 0;
    let usdcTokenBalance = 0;
    let solBalance = 0;
    if (infoes[0]) {
      solBalance = infoes[0].lamports / 1000_000_000;
    }

    if (infoes[1]) {
      const tokenAccount = unpackAccount(userOposAta, infoes[1]);
      oposTokenBalance =
        (parseInt(tokenAccount?.amount?.toString()) ?? 0) / LAMPORTS_PER_OPOS;
    }

    if (infoes[2]) {
      const tokenAccount = unpackAccount(userUSDCAta, infoes[2]);
      usdcTokenBalance =
        (parseInt(tokenAccount?.amount?.toString()) ?? 0) / 1000_000;
    }
    const lineage = await getLineage(this.provider.publicKey.toBase58());
    try {
      const profileInfo = {
        solBalance,
        oposTokenBalance,
        usdcTokenBalance,
        profilelineage: lineage,
      };

      return profileInfo;
    } catch (error) {
      console.log("error profile", error);
      const profileInfo = {
        solBalance,
        oposTokenBalance,
        usdcTokenBalance,
        profilelineage: lineage,
      };
      return profileInfo;
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
        web3Consts.genesisProfile
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

  async getGensisProfileOwner(): Promise<{
    profileHolder: web3.PublicKey;
  }> {
    const mainStateInfo = await this.program.account.mainState.fetch(
      this.mainState
    );
    const genesisProfileAta = (
      await this.connection.getTokenLargestAccounts(
        mainStateInfo.genesisProfile
      )
    ).value[0].address;

    const atasInfo = await this.connection.getMultipleAccountsInfo([
      genesisProfileAta,
    ]);

    const genesisProfileAtaHolder = unpackAccount(
      genesisProfileAta,
      atasInfo[0]
    ).owner;

    return {
      profileHolder: genesisProfileAtaHolder,
    };
  }

  async getNftProfileOwner(nftAddress: web3.PublicKey): Promise<{
    profileHolder: web3.PublicKey;
  }> {
    try {
      const genesisProfileAta = (
        await this.connection.getTokenLargestAccounts(nftAddress)
      ).value[0].address;

      const atasInfo = await this.connection.getMultipleAccountsInfo([
        genesisProfileAta,
      ]);

      const genesisProfileAtaHolder = unpackAccount(
        genesisProfileAta,
        atasInfo[0]
      ).owner;

      return {
        profileHolder: genesisProfileAtaHolder,
      };
    } catch (error) {
      return {
        profileHolder: web3.PublicKey.default,
      };
    }
  }

  async getUserBalance(tokenData: any) {
    try {
      const user = tokenData.address;
      if (!user) throw "Wallet not found";
      console.log("user is ", user);
      const userOposAta = getAssociatedTokenAddressSync(
        new anchor.web3.PublicKey(tokenData.token),
        user
      );
      const infoes = await this.connection.getTokenAccountBalance(userOposAta);
      console.log("infoes ", infoes);
      return infoes.value.uiAmount ? infoes.value.uiAmount : 0;
    } catch (error) {
      console.log("error ", error);
      return 0;
    }
  }

  async __getProfileHoldersInfo(
    input: LineageInfo,
    parentProfile: web3.PublicKey,
    genesisProfile: web3.PublicKey
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
        oposToken,
        currentParentProfileHolder
      ),
      grandParentProfileHolderOposAta: getAssociatedTokenAddressSync(
        oposToken,
        currentGrandParentProfileHolder
      ),
      greatGrandParentProfileHolderOposAta: getAssociatedTokenAddressSync(
        oposToken,
        currentGreatGrandParentProfileHolder
      ),
      ggreatGrandParentProfileHolderOposAta: getAssociatedTokenAddressSync(
        oposToken,
        currentGgreatGrandParentProfileHolder
      ),
      genesisProfileHolderOposAta: getAssociatedTokenAddressSync(
        oposToken,
        currentGenesisProfileHolder
      ),
    };
  }

  async updateToken(input: UpdateToken): Promise<Result<TxPassType<any>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = this.provider.publicKey;
      const profileMetadata = BaseMpl.getMetadataAccount(input.mint);
      const ix = await this.program.methods
        .updateProfile(input.name, input.symbol, input.uri)
        .accounts({
          user,
          mplProgram, // 8
          tokenProgram,
          associatedTokenProgram,
          systemProgram,
          mint: input.mint,
          mainState: this.mainState, // 6
          metadata: profileMetadata,
          sysvarInstructions,
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

  async sendShare(
    token: any,
    holdersfullInfo: any
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = this.provider.publicKey;

      const holdermap: any = [];
      holdersfullInfo.reduce(function (res: any, value: any) {
        if (!res[value.receiver]) {
          res[value.receiver] = { receiver: value.receiver, value: 0 };
          holdermap.push(res[value.receiver]);
        }
        res[value.receiver].value += value.value;
        return res;
      }, {});

      for (let index = 0; index < holdermap.length; index++) {
        const element = holdermap[index];
        let createShare: any = await this.baseSpl.transfer_token_modified({
          mint: new anchor.web3.PublicKey(token),
          sender: user,
          receiver: new anchor.web3.PublicKey(element.receiver),
          init_if_needed: true,
          amount: element.value,
        });
        for (let index = 0; index < createShare.length; index++) {
          this.txis.push(createShare[index]);
        }
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
      const signature = await this.provider.sendAndConfirm(tx as any);

      return {
        Ok: {
          signature,
          info: { profile: "" },
        },
      };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }

  async burnToken(
    token: anchor.web3.PublicKey
  ): Promise<Result<TxPassType<{ profile: string }>, any>> {
    try {
      this.reinit();
      this.baseSpl.__reinit();
      const user = this.provider.publicKey;
      const { ata: minterProfileAta } =
        await this.baseSpl.__getOrCreateTokenAccountInstruction(
          { mint: token, owner: user },
          this.ixCallBack
        );

      const burnIx = createBurnInstruction(
        minterProfileAta, // source token account
        token, // token mint
        this.provider.publicKey, // authority
        1, // amount to burn (based on decimals)
        [], // multisig signers (empty for single-signer)
        TOKEN_PROGRAM_ID
      );

      this.txis.push(burnIx);

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
      const signature = await this.provider.sendAndConfirm(tx as any);

      return {
        Ok: {
          signature,
          info: { profile: "" },
        },
      };
    } catch (error) {
      log({ error });
      return { Err: error };
    }
  }
}
