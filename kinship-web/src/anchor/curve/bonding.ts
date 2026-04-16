import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { bs58, utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { IDL, Mmoshforge } from "../mmoshforge";
import {
  AmmImpl,
  PROGRAM_ID as MER_PROGRAM_ID,
} from "@mercurial-finance/dynamic-amm-sdk";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  NATIVE_MINT,
} from "@solana/spl-token";
import { Metaplex, Metadata as MetadataM } from "@metaplex-foundation/js";
import {
  BondingPricing,
  IBuyArgs,
  ICloseArgs,
  ICreateTokenBondingArgs,
  ICreateTokenBondingOutput,
  ICurve,
  IInitializeCurveArgs,
  IPricingCurve,
  ISellArgs,
  ITransferReservesArgs,
  fromCurve,
} from "./curves";
import {
  InstructionResult,
  TypedAccountParser,
  amountAsNum,
  createMintInstructions,
  getMintInfo,
  getTokenAccount,
  percent,
  toBN,
} from "@strata-foundation/spl-utils";
import { IdlAccounts, Idl } from "@coral-xyz/anchor";

import { Token } from "./spl-token-curve/index";
import { BondingHierarchy } from "./bondingHierarchy";
import { asDecimal, toNumber } from "./utils";
import {
  AssetData,
  PROGRAM_ID,
  TokenStandard,
  createCreateMetadataAccountV3Instruction,
} from "@metaplex-foundation/mpl-token-metadata";
import Config from "./../web3Config.json";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  MINT_SIZE,
  getAssociatedTokenAddress,
  createMintToInstruction,
  getMinimumBalanceForRentExemptAccount,
  createSetAuthorityInstruction,
  AuthorityType,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "forge-spl-token";
import { web3Consts } from "../web3Consts";
import { BaseSpl } from "../base/baseSpl";
import { SEEDS } from "@mercurial-finance/dynamic-amm-sdk/dist/cjs/src/amm/constants";
import { ConnectionContextState } from "@/utils/connection";
import nacl from "tweetnacl";

export type AllocationByPercentage = {
  address: anchor.web3.PublicKey;
  percentage: number;
};

export type AllocationByAmount = {
  address: anchor.web3.PublicKey;
  amount: BN;
};

export type ProgramStateV0 = IdlAccounts<Mmoshforge>["programStateV0"];
export type CurveV0 = IdlAccounts<Mmoshforge>["curveV0"];
export type TokenBondingV0 = IdlAccounts<Mmoshforge>["tokenBondingV0"];

export interface IProgramState extends ProgramStateV0 {
  publicKey: anchor.web3.PublicKey;
}

export interface ITokenBonding extends TokenBondingV0 {
  publicKey: anchor.web3.PublicKey;
}

export interface ICurveConfig {
  toRawConfig(): CurveV0;
}

export class Connectivity {
  programId: web3.PublicKey;
  provider: AnchorProvider;
  txis: web3.TransactionInstruction[] = [];
  extraSigns: web3.Keypair[] = [];
  multiSignInfo: any[] = [];
  program: Program<Mmoshforge>;
  mainState: web3.PublicKey | undefined;
  connection: web3.Connection;
  metaplex: Metaplex;
  baseSpl: BaseSpl;
  state: IProgramState | undefined;
  account;

  tokenBondingDecoder: TypedAccountParser<ITokenBonding> = (
    pubkey,
    account
  ) => {
    const coded = this.program.coder.accounts.decode<ITokenBonding>(
      "tokenBondingV0",
      account.data
    );

    return {
      ...coded,
      publicKey: pubkey,
    };
  };

  constructor(provider: AnchorProvider, programId: web3.PublicKey) {
    web3.SystemProgram.programId;
    this.provider = provider;
    this.connection = provider.connection;
    this.programId = programId;
    this.program = new Program(IDL, this.provider);
    this.metaplex = new Metaplex(this.connection);
    this.baseSpl = new BaseSpl(this.connection);
    this.account = this.program.account;
  }

  curveDecoder: TypedAccountParser<ICurve> = (pubkey, account) => {
    const coded = this.program.coder.accounts.decode<CurveV0>(
      "curveV0",
      account.data
    );

    return {
      ...coded,
      publicKey: pubkey,
    };
  };

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

  /**
   * This is an admin function run once to initialize the smart contract.
   *
   * @returns Instructions needed to create sol storage
   */
  async initializeSolStorageInstructions({
    mintKeypair,
  }: {
    mintKeypair: anchor.web3.Keypair;
  }): Promise<InstructionResult<null>> {
    const exists = await this.getState();

    if (exists) {
      return {
        output: null,
        instructions: [],
        signers: [],
      };
    }

    console.log("Sol storage does not exist, creating...");
    const [state, bumpSeed] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state", "utf-8")],
      this.programId
    );
    const [solStorage, solStorageBumpSeed] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("sol-storage", "utf-8")],
        this.programId
      );
    const [wrappedSolAuthority, mintAuthorityBumpSeed] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("wrapped-sol-authority", "utf-8")],
        this.programId
      );

    const instructions: anchor.web3.TransactionInstruction[] = [];
    const signers: anchor.web3.Signer[] = [];
    signers.push(mintKeypair);

    instructions.push(
      ...[
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: this.provider.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: 82,
          lamports:
            await this.provider.connection.getMinimumBalanceForRentExemption(
              82
            ),
          programId: TOKEN_PROGRAM_ID,
        }),
        Token.createInitMintInstruction(
          TOKEN_PROGRAM_ID,
          mintKeypair.publicKey,
          9,
          this.provider.publicKey,
          wrappedSolAuthority
        ),
      ]
    );

    instructions.push(
      Token.createSetAuthorityInstruction(
        TOKEN_PROGRAM_ID,
        mintKeypair.publicKey,
        wrappedSolAuthority,
        "MintTokens",
        this.provider.publicKey,
        []
      )
    );

    instructions.push(
      await this.program.methods
        .initializeSolStorageV0({
          solStorageBumpSeed,
          bumpSeed,
          mintAuthorityBumpSeed,
        })
        .accounts({
          state,
          payer: this.provider.publicKey,
          solStorage,
          mintAuthority: wrappedSolAuthority,
          wrappedSolMint: mintKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .instruction()
    );

    return {
      instructions,
      signers,
      output: null,
    };
  }

  /**
   * Admin command run once to initialize the smart contract
   */
  async initializeSolStorage({
    mintKeypair,
  }: {
    mintKeypair: anchor.web3.Keypair;
  }): Promise<string> {
    try {
      const tokenObj = await this.initializeSolStorageInstructions({
        mintKeypair,
      });
      const tx = new web3.Transaction().add(...tokenObj.instructions);
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
      const signature = await this.provider.sendAndConfirm(
        tx,
        tokenObj.signers
      );

      return signature;
    } catch (error) {
      console.log(error);
      return "";
    }
  }

  async createTargetMint(
    name: any,
    symbol: any,
    url: any,
    supply: any,
    connect: ConnectionContextState
  ): Promise<string> {
    console.log(
      "from the one -------------------------------------------------------"
    );
    const lamports = await getMinimumBalanceForRentExemptAccount(
      this.connection
    );
    const targetMintKeypair = web3.Keypair.generate();

    const tokenATA = await getAssociatedTokenAddress(
      targetMintKeypair.publicKey,
      this.provider.publicKey
    );
    const instructions: anchor.web3.TransactionInstruction[] = [];
    const index = 0;

    // Find the proper bonding index to use that isn't taken.
    let indexToUse = index || 0;
    const getTokenBonding: () => Promise<
      [anchor.web3.PublicKey, Number]
    > = () => {
      return this.tokenBondingKey(
        targetMintKeypair.publicKey!,
        indexToUse,
        this.programId
      );
    };
    const getTokenBondingAccount = async () => {
      return this.provider.connection.getAccountInfo(
        (await getTokenBonding())[0]
      );
    };
    if (!index) {
      // Find an empty voucher account
      while (await getTokenBondingAccount()) {
        indexToUse++;
      }
    } else {
      indexToUse = index;
    }

    const [tokenBonding, bumpSeed] = await this.tokenBondingKey(
      targetMintKeypair.publicKey!,
      indexToUse,
      this.programId
    );

    console.log("token boding is ", tokenBonding.toBase58());

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
        9,
        this.provider.publicKey,
        this.provider.publicKey,
        TOKEN_PROGRAM_ID
      )
    );

    if (supply > 0) {
      if (!(await this.accountExists(tokenATA))) {
        console.log("created token account...");
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            targetMintKeypair.publicKey,
            tokenATA,
            this.provider.publicKey,
            this.provider.publicKey
          )
        );
      }
      console.log("created token supply...");
      instructions.push(
        createMintToInstruction(
          targetMintKeypair.publicKey,
          tokenATA,
          this.provider.publicKey,
          supply // or 1000000 for fungible
        )
      );
    }

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
        updateAuthority: tokenBonding,
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

    instructions.push(
      createMetadataInstruction,
      createSetAuthorityInstruction(
        targetMintKeypair.publicKey,
        this.provider.publicKey,
        AuthorityType.MintTokens,
        tokenBonding,
        [],
        TOKEN_PROGRAM_ID
      ),
      createSetAuthorityInstruction(
        targetMintKeypair.publicKey,
        this.provider.publicKey,
        AuthorityType.FreezeAccount,
        tokenBonding,
        [],
        TOKEN_PROGRAM_ID
      )
    );

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

    console.log(
      "---------------------send and confirm from the one----------------"
    );
    console.log(
      this.provider.wallet.publicKey.toBase58(),
      "this.provider.wallet.publicKey @@@@@@@@@@@@@@@2"
    );
    console.log(targetMintKeypair, "targetMintKeypair =====================>>");
    const messageBuffer = tx.compileMessage().serialize();
    const messageBytes = new Uint8Array(
      messageBuffer.buffer,
      messageBuffer.byteOffset,
      messageBuffer.byteLength
    );

    const mintSig = nacl.sign.detached(
      messageBytes,
      targetMintKeypair.secretKey
    );
    tx.addSignature(targetMintKeypair.publicKey, Buffer.from(mintSig));
    const signedTx = await this.provider.wallet.signTransaction(tx as any);
    console.log(signedTx, " =======================================>");
    const signature = await connect.sendAndConfirm(
      signedTx as any,
      this.provider.wallet.publicKey.toBase58()
    );
    // const signature = await this.provider.sendAndConfirm(tx, [
    //   targetMintKeypair,
    // ]);
    console.log(
      signature,
      "signature from the new transcapi ========================================"
    );
    return targetMintKeypair.publicKey.toBase58();
  }

  fromAllocationsToAmount(
    lpAmount: BN,
    allocations: AllocationByPercentage[]
  ): AllocationByAmount[] {
    const sumPercentage = allocations.reduce(
      (partialSum, a) => partialSum + a.percentage,
      0
    );
    if (sumPercentage === 0) {
      throw Error("sumPercentage is zero");
    }

    let amounts: AllocationByAmount[] = [];
    let sum = new BN(0);
    for (let i = 0; i < allocations.length - 1; i++) {
      const amount = lpAmount
        .mul(new BN(allocations[i].percentage))
        .div(new BN(sumPercentage));
      sum = sum.add(amount);
      amounts.push({
        address: allocations[i].address,
        amount,
      });
    }
    // the last wallet get remaining amount
    amounts.push({
      address: allocations[allocations.length - 1].address,
      amount: lpAmount.sub(sum),
    });
    return amounts;
  }

  async addAddtionalToken(
    mint: anchor.web3.PublicKey,
    supply: number
  ): Promise<string> {
    const tokenATA = await getAssociatedTokenAddressSync(
      mint,
      this.provider.publicKey
    );
    const instructions: anchor.web3.TransactionInstruction[] = [];

    const info = await this.provider.connection.getAccountInfo(tokenATA);

    if (!info) {
      const ix = createAssociatedTokenAccountInstruction(
        this.provider.publicKey,
        tokenATA,
        this.provider.publicKey,
        mint
      );
      instructions.push(ix);
    }

    const ix = createMintToInstruction(
      mint,
      tokenATA,
      this.provider.publicKey,
      supply
    );
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
    const signature = await this.provider.sendAndConfirm(tx);

    return signature;
  }

  getSecondKey(key1: anchor.web3.PublicKey, key2: anchor.web3.PublicKey) {
    const buf1: any = key1.toBuffer();
    const buf2: any = key2.toBuffer();
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
      return buf2;
    }
    return buf1;
  }

  getFirstKey(key1: anchor.web3.PublicKey, key2: anchor.web3.PublicKey) {
    const buf1: any = key1.toBuffer();
    const buf2: any = key2.toBuffer();
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
      return buf1;
    }
    return buf2;
  }

  derivePoolAddressWithConfig(
    tokenA: anchor.web3.PublicKey,
    tokenB: anchor.web3.PublicKey,
    config: anchor.web3.PublicKey,
    programId: anchor.web3.PublicKey
  ) {
    const [poolPubkey] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        this.getFirstKey(tokenA, tokenB),
        this.getSecondKey(tokenA, tokenB),
        config.toBuffer(),
      ],
      programId
    );

    return poolPubkey;
  }

  async createPoolAndLockLiquidity(
    tokenAMint: anchor.web3.PublicKey,
    tokenBMint: anchor.web3.PublicKey,
    tokenAAmount: BN,
    tokenBAmount: BN,
    config: anchor.web3.PublicKey,
    allocations: AllocationByPercentage[]
  ): Promise<string> {
    const programID = new anchor.web3.PublicKey(MER_PROGRAM_ID);
    const poolPubkey = this.derivePoolAddressWithConfig(
      tokenAMint,
      tokenBMint,
      config,
      programID
    );
    // Create the pool
    console.log("create pool %s", poolPubkey);
    let transactions =
      await AmmImpl.createPermissionlessConstantProductPoolWithConfig(
        this.provider.connection,
        this.provider.publicKey,
        tokenAMint,
        tokenBMint,
        tokenAAmount,
        tokenBAmount,
        config
      );
    for (const tx of transactions) {
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
      const signature = await this.provider.sendAndConfirm(tx);
      console.log("transaction %s", signature);
    }

    // Create escrow and lock liquidity
    // await delay(15000)
    // const [lpMint] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from(SEEDS.LP_MINT), poolPubkey.toBuffer()], programID);
    // const payerPoolLp = await getAssociatedTokenAddress(lpMint, this.provider.publicKey);
    // const payerPoolLpBalance = (await this.provider.connection.getTokenAccountBalance(payerPoolLp)).value.amount;
    // console.log('payerPoolLpBalance %s', payerPoolLpBalance.toString());

    // let allocationByAmounts =this.fromAllocationsToAmount(new BN(payerPoolLpBalance), allocations);
    // const pool = await AmmImpl.create(this.provider.connection, poolPubkey);
    // for (const allocation of allocationByAmounts) {
    //   console.log('Lock liquidity %s', allocation.address.toString());
    //   let tx = await pool.lockLiquidity(allocation.address, allocation.amount, this.provider.publicKey);
    //   tx.recentBlockhash = (
    //     await this.connection.getLatestBlockhash()
    //   ).blockhash;
    //   tx.feePayer = this.provider.publicKey;

    //   const feeEstimate = await this.getPriorityFeeEstimate(tx);
    //   let feeIns;
    //   if (feeEstimate > 0) {
    //     feeIns = web3.ComputeBudgetProgram.setComputeUnitPrice({
    //       microLamports: feeEstimate,
    //     });
    //   } else {
    //     feeIns = web3.ComputeBudgetProgram.setComputeUnitLimit({
    //       units: 1_400_000,
    //     });
    //   }
    //   tx.add(feeIns);
    //   const signature = await this.provider.sendAndConfirm(tx);
    //   console.log('transaction %s', signature);
    // }

    return poolPubkey.toBase58();
  }

  async createTokenBonding(
    args: ICreateTokenBondingArgs,
    connection: ConnectionContextState
  ): Promise<ICreateTokenBondingOutput> {
    const tokenObj = await this.createTokenBondingInstructions(args);
    const tx = new web3.Transaction().add(...tokenObj.instructions);
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
    console.log(
      "-------------------------createtokenbonding--------------------------------------------"
    );
    console.log(tokenObj.signers, "signer============>>");
    let targetMintKeypair = tokenObj.signers[0];
    const messageBuffer = tx.compileMessage().serialize();
    const messageBytes = new Uint8Array(
      messageBuffer.buffer,
      messageBuffer.byteOffset,
      messageBuffer.byteLength
    );
    const mintSig = nacl.sign.detached(
      messageBytes,
      targetMintKeypair.secretKey
    );
    tx.addSignature(targetMintKeypair.publicKey, Buffer.from(mintSig));
    const signedTx = await this.provider.wallet.signTransaction(tx as any);
    console.log(
      signedTx,
      " sign from the createTokenBonding=======================================>"
    );
    const signature = await connection.sendAndConfirm(
      signedTx as any,
      this.provider.wallet.publicKey.toBase58()
    );

    // const signature = await this.provider.sendAndConfirm(tx, tokenObj.signers);

    console.log("createTokenBonding singnature from the api", signature);
    return tokenObj.output;
  }

  /**
   * Create a bonding curve
   *
   * @param param0
   * @returns
   */
  async createTokenBondingInstructions({
    name,
    symbol,
    url,
    generalAuthority = this.provider.publicKey,
    curveAuthority = null,
    reserveAuthority = null,
    payer = this.provider.publicKey,
    curve,
    baseMint,
    targetMint,
    buyBaseRoyalties,
    buyBaseRoyaltiesOwner = this.provider.publicKey,
    buyTargetRoyalties,
    buyTargetRoyaltiesOwner = this.provider.publicKey,
    sellBaseRoyalties,
    sellBaseRoyaltiesOwner = this.provider.publicKey,
    sellTargetRoyalties,
    sellTargetRoyaltiesOwner = this.provider.publicKey,
    buyBaseRoyaltyPercentage = 0,
    buyTargetRoyaltyPercentage = 0,
    sellBaseRoyaltyPercentage = 0,
    sellTargetRoyaltyPercentage = 0,
    mintCap,
    purchaseCap,
    goLiveDate,
    freezeBuyDate,
    targetMintDecimals,
    targetMintKeypair = anchor.web3.Keypair.generate(),
    buyFrozen = false,
    ignoreExternalReserveChanges = false,
    ignoreExternalSupplyChanges = false,
    sellFrozen = false,
    index,
    advanced = {
      initialSupplyPad: 0,
      initialReservesPad: 0,
    },
  }: ICreateTokenBondingArgs): Promise<
    InstructionResult<ICreateTokenBondingOutput>
  > {
    if (!targetMint) {
      if (sellTargetRoyalties || buyTargetRoyalties) {
        throw new Error(
          "Cannot define target royalties if mint is not defined"
        );
      }

      if (typeof targetMintDecimals == "undefined") {
        throw new Error("Cannot define mint without decimals ");
      }
    }

    if (!goLiveDate) {
      goLiveDate = new Date(0);
      goLiveDate.setUTCSeconds((await this.getUnixTime()) - 10);
    }

    const provider = this.provider;
    const state = (await this.getState())!;

    // let isNative =
    let isNative =
      baseMint.equals(NATIVE_MINT) || baseMint.equals(state.wrappedSolMint);
    if (isNative) {
      baseMint = state.wrappedSolMint;
    }

    const instructions: anchor.web3.TransactionInstruction[] = [];
    const signers: anchor.web3.Signer[] = [];
    let shouldCreateMint = false;
    if (!targetMint) {
      signers.push(targetMintKeypair);
      targetMint = targetMintKeypair.publicKey;
      shouldCreateMint = true;
    }

    // Find the proper bonding index to use that isn't taken.
    let indexToUse = index || 0;
    const getTokenBonding: () => Promise<
      [anchor.web3.PublicKey, Number]
    > = () => {
      return this.tokenBondingKey(targetMint!, indexToUse, this.programId);
    };
    const getTokenBondingAccount = async () => {
      return this.provider.connection.getAccountInfo(
        (await getTokenBonding())[0]
      );
    };
    if (!index) {
      // Find an empty voucher account
      while (await getTokenBondingAccount()) {
        indexToUse++;
      }
    } else {
      indexToUse = index;
    }

    const [tokenBonding, bumpSeed] = await this.tokenBondingKey(
      targetMint!,
      indexToUse,
      this.programId
    );

    if (shouldCreateMint) {
      const lamports = await getMinimumBalanceForRentExemptAccount(
        this.connection
      );
      const targetMintKeypair = web3.Keypair.generate();
      instructions.push(
        // ...(await createMintInstructions(
        //   provider,
        //   tokenBonding,
        //   targetMint,
        //   targetMintDecimals
        // )),
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: this.provider.publicKey,
          newAccountPubkey: targetMintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          targetMintKeypair.publicKey,
          9,
          tokenBonding,
          tokenBonding,
          TOKEN_PROGRAM_ID
        )
      );

      // const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
      //   {
      //     metadata: anchor.web3.PublicKey.findProgramAddressSync(
      //       [
      //         Buffer.from("metadata"),
      //         PROGRAM_ID.toBuffer(),
      //         targetMint.toBuffer(),
      //       ],
      //       PROGRAM_ID,
      //     )[0],
      //     mint: targetMint,
      //     mintAuthority: tokenBonding,
      //     payer: this.provider.publicKey,
      //     updateAuthority: tokenBonding,
      //   },
      //   {
      //     createMetadataAccountArgsV3: {
      //       data: {
      //         name: name,
      //         symbol: symbol,
      //         uri: url,
      //         creators: null,
      //         sellerFeeBasisPoints: 0,
      //         uses: null,
      //         collection: null,
      //       },
      //       isMutable: false,
      //       collectionDetails: null,
      //     },
      //   },
      // );

      // instructions.push(createMetadataInstruction);
    }

    const baseStorageKeypair = anchor.web3.Keypair.generate();
    signers.push(baseStorageKeypair);
    const baseStorage = baseStorageKeypair.publicKey;

    console.log("baseMint ", baseMint.toBase58());
    console.log("baseStorage ", baseStorage.toBase58());
    console.log("tokenBonding ", tokenBonding.toBase58());
    console.log("targetMint ", targetMint.toBase58());

    instructions.push(
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: payer,
        newAccountPubkey: baseStorage!,
        space: AccountLayout.span,
        programId: TOKEN_PROGRAM_ID,
        lamports:
          await this.provider.connection.getMinimumBalanceForRentExemption(
            AccountLayout.span
          ),
      }),
      Token.createInitAccountInstruction(
        TOKEN_PROGRAM_ID,
        baseMint,
        baseStorage,
        tokenBonding
      )
    );

    console.log("createInitAccountInstruction completed");

    if (isNative) {
      buyBaseRoyalties =
        buyBaseRoyalties === null
          ? null
          : buyBaseRoyalties || buyBaseRoyaltiesOwner;
      sellBaseRoyalties =
        sellBaseRoyalties === null
          ? null
          : sellBaseRoyalties || sellBaseRoyaltiesOwner;
    }

    let createdAccts: Set<string> = new Set();
    if (typeof buyTargetRoyalties === "undefined") {
      buyTargetRoyalties = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        targetMint,
        buyTargetRoyaltiesOwner,
        true
      );

      // If sell target royalties are undefined, we'll do this in the next step
      if (
        !createdAccts.has(buyTargetRoyalties.toBase58()) &&
        !(await this.accountExists(buyTargetRoyalties))
      ) {
        console.log("Creating buy target royalties...");
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            targetMint,
            buyTargetRoyalties,
            buyTargetRoyaltiesOwner,
            payer
          )
        );
        createdAccts.add(buyTargetRoyalties.toBase58());
      }
    }

    if (typeof sellTargetRoyalties === "undefined") {
      sellTargetRoyalties = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        targetMint,
        sellTargetRoyaltiesOwner,
        true
      );

      if (
        !createdAccts.has(sellTargetRoyalties.toBase58()) &&
        !(await this.accountExists(sellTargetRoyalties))
      ) {
        console.log("Creating sell target royalties...");
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            targetMint,
            sellTargetRoyalties,
            sellTargetRoyaltiesOwner,
            payer
          )
        );
        createdAccts.add(buyTargetRoyalties!.toBase58());
      }
    }

    if (typeof buyBaseRoyalties === "undefined") {
      buyBaseRoyalties = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        baseMint,
        buyBaseRoyaltiesOwner,
        true
      );

      // If sell base royalties are undefined, we'll do this in the next step
      if (
        !createdAccts.has(buyBaseRoyalties.toBase58()) &&
        !(await this.accountExists(buyBaseRoyalties))
      ) {
        console.log("Creating base royalties...", buyBaseRoyalties.toBase58());
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            baseMint,
            buyBaseRoyalties,
            buyBaseRoyaltiesOwner,
            payer
          )
        );
        createdAccts.add(buyBaseRoyalties.toBase58());
      }
    }

    if (typeof sellBaseRoyalties === "undefined") {
      sellBaseRoyalties = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        baseMint,
        sellBaseRoyaltiesOwner,
        true
      );

      if (
        !createdAccts.has(sellBaseRoyalties.toBase58()) &&
        !(await this.accountExists(sellBaseRoyalties))
      ) {
        console.log("Creating base royalties...", sellBaseRoyalties.toBase58());
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            baseMint,
            sellBaseRoyalties,
            sellBaseRoyaltiesOwner,
            payer
          )
        );
        createdAccts.add(sellBaseRoyalties.toBase58());
      }
    }
    const pads = {
      initialReservesPad: advanced.initialReservesPad
        ? toBN(
            advanced.initialReservesPad,
            await getMintInfo(this.provider, baseMint)
          )
        : new BN(0),
      initialSupplyPad: advanced.initialSupplyPad
        ? toBN(
            advanced.initialSupplyPad,
            typeof targetMintDecimals == "undefined"
              ? (await getMintInfo(this.provider, targetMint)).decimals
              : targetMintDecimals
          )
        : new BN(0),
    };

    const ix = await this.program.methods
      .initializeTokenBondingV0({
        index: indexToUse,
        goLiveUnixTime: new BN(Math.floor(goLiveDate.valueOf() / 1000)),
        freezeBuyUnixTime: freezeBuyDate
          ? new BN(Math.floor(freezeBuyDate.valueOf() / 1000))
          : null,
        buyBaseRoyaltyPercentage: percent(buyBaseRoyaltyPercentage) || 0,
        buyTargetRoyaltyPercentage: percent(buyTargetRoyaltyPercentage) || 0,
        sellBaseRoyaltyPercentage: percent(sellBaseRoyaltyPercentage) || 0,
        sellTargetRoyaltyPercentage: percent(sellTargetRoyaltyPercentage) || 0,
        mintCap: mintCap || null,
        purchaseCap: purchaseCap || null,
        generalAuthority,
        curveAuthority,
        reserveAuthority,
        bumpSeed,
        buyFrozen,
        ignoreExternalReserveChanges,
        ignoreExternalSupplyChanges,
        sellFrozen,
        ...pads,
      })
      .accounts({
        payer: payer,
        curve,
        tokenBonding,
        baseMint,
        targetMint,
        baseStorage,
        buyBaseRoyalties:
          buyBaseRoyalties === null
            ? this.provider.publicKey // Default to this wallet, it just needs a system program acct
            : buyBaseRoyalties,
        buyTargetRoyalties:
          buyTargetRoyalties === null
            ? this.provider.publicKey // Default to this wallet, it just needs a system program acct
            : buyTargetRoyalties,
        sellBaseRoyalties:
          sellBaseRoyalties === null
            ? this.provider.publicKey // Default to this wallet, it just needs a system program acct
            : sellBaseRoyalties,
        sellTargetRoyalties:
          sellTargetRoyalties === null
            ? this.provider.publicKey // Default to this wallet, it just needs a system program acct
            : sellTargetRoyalties,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .instruction();

    instructions.push(ix);

    return {
      output: {
        baseMint,
        tokenBonding,
        targetMint,
        buyBaseRoyalties: buyBaseRoyalties || this.provider.publicKey,
        buyTargetRoyalties: buyTargetRoyalties || this.provider.publicKey,
        sellBaseRoyalties: sellBaseRoyalties || this.provider.publicKey,
        sellTargetRoyalties: sellTargetRoyalties || this.provider.publicKey,
        baseStorage,
      },
      instructions,
      signers,
    };
  }

  async initializeCurve(
    args: IInitializeCurveArgs,
    connection: ConnectionContextState
  ): Promise<anchor.web3.PublicKey> {
    const tokenObj = await this.initializeCurveInstructions(args);
    const tx = new web3.Transaction().add(...tokenObj.instructions);
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
    console.log(
      "initialloze curve send and confirm -------------------------------------------"
    );
    console.log(tx, "tx value =================================>>");
    console.log(
      tokenObj.signers[0],
      "signers ================================>"
    );
    let targetMintKeypair = tokenObj.signers[0];
    const messageBuffer = tx.compileMessage().serialize();
    const messageBytes = new Uint8Array(
      messageBuffer.buffer,
      messageBuffer.byteOffset,
      messageBuffer.byteLength
    );
    const mintSig = nacl.sign.detached(
      messageBytes,
      targetMintKeypair.secretKey
    );
    tx.addSignature(targetMintKeypair.publicKey, Buffer.from(mintSig));
    const signedTx = await this.provider.wallet.signTransaction(tx as any);
    console.log(
      signedTx,
      " sign from the initializeCurve=======================================>"
    );
    const signature = await connection.sendAndConfirm(
      signedTx as any,
      this.provider.wallet.publicKey.toBase58()
    );
    // const signature = await this.provider.sendAndConfirm(tx, tokenObj.signers);
    console.log(
      "initializeCurve singnature from the api ----------------- ",
      signature
    );
    console.log("initializeCurve ", tokenObj.output.curve.toBase58());
    return tokenObj.output.curve;
  }

  async initializeCurveInstructions({
    payer = this.provider.publicKey,
    config: curveConfig,
    curveKeypair = anchor.web3.Keypair.generate(),
  }: IInitializeCurveArgs): Promise<
    InstructionResult<{ curve: anchor.web3.PublicKey }>
  > {
    const curve = curveConfig.toRawConfig();
    return {
      output: {
        curve: curveKeypair.publicKey,
      },
      signers: [curveKeypair],
      instructions: [
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: payer,
          newAccountPubkey: curveKeypair.publicKey,
          space: 500,
          lamports:
            await this.provider.connection.getMinimumBalanceForRentExemption(
              500
            ),
          programId: this.programId,
        }),
        await this.program.methods
          .createCurveV0(curve)
          .accounts({
            payer,
            curve: curveKeypair.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .instruction(),
      ],
    };
  }

  async buy(args: IBuyArgs, connect: ConnectionContextState): Promise<string> {
    const tokenObj = await this.buyInstructions(args);
    const tx = new web3.Transaction().add(...tokenObj.instructions);
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
    console.log(
      "------------------------buy send and confirm ---------------------------------"
    );
    console.log(tokenObj.signers, "token signer ===========================>");
    console.log(
      tokenObj.signers[0],
      "tokenObj.signers[0] ====================>"
    );
    console.log(
      tokenObj.signers.length,
      "token signer length===========================>"
    );

    let signature;
    if (tokenObj.signers.length != 0) {
      let targetMintKeypair = tokenObj.signers[0];
      const messageBuffer = tx.compileMessage().serialize();
      const messageBytes = new Uint8Array(
        messageBuffer.buffer,
        messageBuffer.byteOffset,
        messageBuffer.byteLength
      );
      const mintSig = nacl.sign.detached(
        messageBytes,
        targetMintKeypair.secretKey
      );
      tx.addSignature(targetMintKeypair.publicKey, Buffer.from(mintSig));
      const signedTx = await this.provider.wallet.signTransaction(tx as any);
      console.log(
        signedTx,
        " sign from the swap transaction=======================================>"
      );
      signature = await connect.sendAndConfirm(
        signedTx as any,
        this.provider.wallet.publicKey.toBase58()
      );
      console.log(
        signature,
        "signature from the send and confirm api from the if condtion ======================"
      );
    } else {
      const signedTx = await this.provider.wallet.signTransaction(tx as any);
      console.log(signedTx, "====================>");
      signature = await connect.sendAndConfirm(
        signedTx as any,
        this.provider.wallet.publicKey.toBase58()
      );
      console.log(signature,"signature from the else contion ===============>>=======================")
    }
    // const signature = await this.provider.sendAndConfirm(tx, tokenObj.signers);
    console.log("buy =================================", signature);
    return signature;
  }

  /**
   * Issue a command to buy `targetMint` tokens with `baseMint` tokens.
   *
   * @param param0
   * @returns
   */
  async buyInstructions({
    tokenBonding,
    source,
    sourceAuthority = this.provider.publicKey,
    destination,
    desiredTargetAmount,
    baseAmount,
    expectedOutputAmount,
    expectedBaseAmount,
    slippage,
    payer = this.provider.publicKey,
  }: IBuyArgs): Promise<InstructionResult<null>> {
    const state = (await this.getState())!;
    console.log("tokenBondingAcct", tokenBonding.toBase58());
    const tokenBondingAcct = (await this.getTokenBonding(tokenBonding))!;
    console.log("tokenBondingAcct", tokenBondingAcct.baseMint.toBase58());
    console.log("tokenBondingAcct", tokenBondingAcct.targetMint.toBase58());
    const isNative =
      tokenBondingAcct.baseMint.equals(NATIVE_MINT) ||
      tokenBondingAcct.baseMint.equals(state.wrappedSolMint);

    console.log("isnative ", isNative);

    // const isNative = false;

    // @ts-ignore
    const targetMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.targetMint
    );

    const baseMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.baseMint
    );

    const baseStorage = await getTokenAccount(
      this.provider,
      tokenBondingAcct.baseStorage
    );

    const curve = await this.getPricingCurve(
      tokenBondingAcct.curve,
      amountAsNum(
        tokenBondingAcct.ignoreExternalReserveChanges
          ? tokenBondingAcct.reserveBalanceFromBonding
          : baseStorage.amount,
        baseMint
      ),
      amountAsNum(
        tokenBondingAcct.ignoreExternalSupplyChanges
          ? tokenBondingAcct.supplyFromBonding
          : targetMint.supply,
        targetMint
      ),
      tokenBondingAcct.goLiveUnixTime.toNumber()
    );

    const instructions: anchor.web3.TransactionInstruction[] = this.txis;
    console.log("buy instruction is ", instructions);

    this.txis = [];
    // let req = ComputeBudgetProgram.setComputeUnitLimit({units: 400000});
    // instructions.push(req);

    if (!destination) {
      destination = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenBondingAcct.targetMint,
        sourceAuthority,
        true
      );

      if (!(await this.accountExists(destination))) {
        console.log("Creating target account");
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            tokenBondingAcct.targetMint,
            destination,
            sourceAuthority,
            payer
          )
        );
      }
    }

    let buyTargetAmount: any = null;
    let buyWithBase: any = null;
    let maxPrice: number = 0;

    const unixTime = await this.getUnixTime();

    if (desiredTargetAmount) {
      const desiredTargetAmountNum = toNumber(desiredTargetAmount, targetMint);

      const neededAmount =
        desiredTargetAmountNum *
        (1 / (1 - asDecimal(tokenBondingAcct.buyTargetRoyaltyPercentage)));

      const min = expectedBaseAmount
        ? toNumber(expectedBaseAmount, targetMint)
        : curve.buyTargetAmount(
            desiredTargetAmountNum,
            tokenBondingAcct.buyBaseRoyaltyPercentage,
            tokenBondingAcct.buyTargetRoyaltyPercentage,
            unixTime
          );

      maxPrice = min * (1 + slippage);

      buyTargetAmount = {
        targetAmount: new BN(
          Math.floor(neededAmount * Math.pow(10, targetMint.decimals))
        ),
        maximumPrice: toBN(maxPrice, baseMint),
      };
    }

    if (baseAmount) {
      const baseAmountNum = toNumber(baseAmount, baseMint);
      maxPrice = baseAmountNum;

      const min = expectedOutputAmount
        ? toNumber(expectedOutputAmount, targetMint)
        : curve.buyWithBaseAmount(
            baseAmountNum,
            tokenBondingAcct.buyBaseRoyaltyPercentage,
            tokenBondingAcct.buyTargetRoyaltyPercentage,
            unixTime
          );

      buyWithBase = {
        baseAmount: toBN(baseAmount, baseMint),
        minimumTargetAmount: new BN(
          Math.ceil(min * (1 - slippage) * Math.pow(10, targetMint.decimals))
        ),
      };
    }

    if (!source) {
      if (isNative) {
        source = sourceAuthority;
      } else {
        source = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          tokenBondingAcct.baseMint,
          sourceAuthority,
          true
        );

        if (!(await this.accountExists(source))) {
          console.warn(
            "Source account for bonding buy does not exist, if it is not created in an earlier instruction this can cause an error"
          );
        }
      }
    }

    const args: anchor.IdlTypes<Mmoshforge>["buyV0Args"] = {
      // @ts-ignore
      buyTargetAmount,
      // @ts-ignore
      buyWithBase,
    };

    const common = {
      tokenBonding,
      // @ts-ignore
      curve: tokenBondingAcct.curve,
      baseMint: tokenBondingAcct.baseMint,
      targetMint: tokenBondingAcct.targetMint,
      baseStorage: tokenBondingAcct.baseStorage,
      buyBaseRoyalties: tokenBondingAcct.buyBaseRoyalties,
      buyTargetRoyalties: tokenBondingAcct.buyTargetRoyalties,
      tokenProgram: TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      destination,
    };

    if (isNative) {
      console.log("isnative 1", isNative);
      instructions.push(
        await this.program.methods
          .buyNativeV0(args)
          .accounts({
            common,
            state: state.publicKey,
            wrappedSolMint: state.wrappedSolMint,
            mintAuthority: (
              await this.wrappedSolMintAuthorityKey(this.programId)
            )[0],
            solStorage: state.solStorage,
            systemProgram: anchor.web3.SystemProgram.programId,
            source,
          })
          .instruction()
      );
    } else {
      instructions.push(
        await this.program.methods
          .buyV1(args)
          .accounts({
            common,
            state: state.publicKey,
            source,
            sourceAuthority,
          })
          .instruction()
      );
    }

    return {
      output: null,
      signers: [],
      instructions,
    };
  }

  async sell(args: ISellArgs): Promise<string> {
    const tokenObj = await this.sellInstructions(args);
    const tx = new web3.Transaction().add(...tokenObj.instructions);
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
    const signature = await this.provider.sendAndConfirm(tx, tokenObj.signers);
    console.log("sell ", signature);
    return signature;
  }

  /**
   * Instructions to burn `targetMint` tokens in exchange for `baseMint` tokens
   *
   * @param param0
   * @returns
   */
  async sellInstructions({
    tokenBonding,
    source,
    sourceAuthority = this.provider.publicKey,
    destination,
    targetAmount,
    expectedOutputAmount,
    slippage,
    payer = this.provider.publicKey,
  }: ISellArgs): Promise<InstructionResult<null>> {
    const state = (await this.getState())!;
    const tokenBondingAcct = (await this.getTokenBonding(tokenBonding))!;
    if (tokenBondingAcct.sellFrozen) {
      throw new Error("Sell is frozen on this bonding curve");
    }

    const isNative =
      tokenBondingAcct.baseMint.equals(NATIVE_MINT) ||
      tokenBondingAcct.baseMint.equals(state.wrappedSolMint);

    // @ts-ignore
    const targetMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.targetMint
    );
    const baseMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.baseMint
    );
    const baseStorage = await getTokenAccount(
      this.provider,
      tokenBondingAcct.baseStorage
    );
    // @ts-ignore
    const curve = await this.getPricingCurve(
      tokenBondingAcct.curve,
      amountAsNum(
        tokenBondingAcct.ignoreExternalReserveChanges
          ? tokenBondingAcct.reserveBalanceFromBonding
          : baseStorage.amount,
        baseMint
      ),
      amountAsNum(
        tokenBondingAcct.ignoreExternalSupplyChanges
          ? tokenBondingAcct.supplyFromBonding
          : targetMint.supply,
        targetMint
      ),
      tokenBondingAcct.goLiveUnixTime.toNumber()
    );

    const instructions: anchor.web3.TransactionInstruction[] = this.txis;
    console.log("sell instruction is ", instructions);
    this.txis = [];

    // let req = ComputeBudgetProgram.setComputeUnitLimit({units: 350000});
    // instructions.push(req);
    if (!source) {
      source = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenBondingAcct.targetMint,
        sourceAuthority,
        true
      );

      if (!(await this.accountExists(source))) {
        console.warn(
          "Source account for bonding buy does not exist, if it is not created in an earlier instruction this can cause an error"
        );
      }
    }

    if (!destination) {
      if (isNative) {
        destination = sourceAuthority;
      } else {
        destination = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          tokenBondingAcct.baseMint,
          sourceAuthority,
          true
        );

        if (!(await this.accountExists(destination))) {
          console.log("Creating base account");
          instructions.push(
            Token.createAssociatedTokenAccountInstruction(
              ASSOCIATED_TOKEN_PROGRAM_ID,
              TOKEN_PROGRAM_ID,
              tokenBondingAcct.baseMint,
              destination,
              sourceAuthority,
              payer
            )
          );
        }
      }
    }

    const unixTime = await this.getUnixTime();
    const targetAmountNum = toNumber(targetAmount, targetMint);

    const min = expectedOutputAmount
      ? toNumber(expectedOutputAmount, baseMint)
      : curve.sellTargetAmount(
          targetAmountNum,
          tokenBondingAcct.sellBaseRoyaltyPercentage,
          tokenBondingAcct.sellTargetRoyaltyPercentage,
          unixTime
        );

    const args: anchor.IdlTypes<Mmoshforge>["sellV0Args"] = {
      targetAmount: toBN(targetAmount, targetMint),
      minimumPrice: new BN(
        Math.ceil(min * (1 - slippage) * Math.pow(10, baseMint.decimals))
      ),
    };

    const common = {
      tokenBonding,
      // @ts-ignore
      curve: tokenBondingAcct.curve,
      baseMint: tokenBondingAcct.baseMint,
      targetMint: tokenBondingAcct.targetMint,
      baseStorage: tokenBondingAcct.baseStorage,
      sellBaseRoyalties: tokenBondingAcct.sellBaseRoyalties,
      sellTargetRoyalties: tokenBondingAcct.sellTargetRoyalties,
      source,
      sourceAuthority,
      tokenProgram: TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    };

    if (isNative) {
      instructions.push(
        await this.program.methods
          .sellNativeV0(args)
          .accounts({
            common,
            destination,
            state: state.publicKey,
            wrappedSolMint: state.wrappedSolMint,
            mintAuthority: (
              await this.wrappedSolMintAuthorityKey(this.programId)
            )[0],
            solStorage: state.solStorage,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .instruction()
      );
    } else {
      console.log(
        "sell instruction args minimumPrice",
        args.minimumPrice.toNumber()
      );
      console.log(
        "sell instruction args targetAmount",
        args.targetAmount.toNumber()
      );
      console.log("sell instruction args  common", {
        tokenBonding: tokenBonding.toBase58(),
        // @ts-ignore
        curve: tokenBondingAcct.curve.toBase58(),
        baseMint: tokenBondingAcct.baseMint.toBase58(),
        targetMint: tokenBondingAcct.targetMint.toBase58(),
        baseStorage: tokenBondingAcct.baseStorage.toBase58(),
        sellBaseRoyalties: tokenBondingAcct.sellBaseRoyalties.toBase58(),
        sellTargetRoyalties: tokenBondingAcct.sellTargetRoyalties.toBase58(),
        source: source.toBase58(),
        sourceAuthority: sourceAuthority.toBase58(),
        tokenProgram: TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      });
      instructions.push(
        await this.program.methods
          .sellV1(args)
          .accounts({
            common,
            state: state.publicKey,
            destination,
          })
          .instruction()
      );
    }

    return {
      output: null,
      signers: [],
      instructions,
    };
  }

  /**
   * Runs {@link closeInstructions}
   * @param args
   */
  async transferReserves(args: ITransferReservesArgs): Promise<string> {
    try {
      const tokenObj = await this.transferReservesInstructions(args);
      const tx = new web3.Transaction().add(...tokenObj.instructions);
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
      const signature = await this.provider.sendAndConfirm(
        tx,
        tokenObj.signers
      );
      console.log("transfer reserve ", signature);
      return signature;
    } catch (error) {
      console.log("error is", error);
      return "";
    }
  }

  /**
   * Instructions to transfer the reserves of the bonding curve
   *
   * @param param0
   * @returns
   */
  async transferReservesInstructions({
    tokenBonding,
    destination,
    amount,
    reserveAuthority,
    destinationWallet = this.provider.publicKey,
    payer = this.provider.publicKey,
  }: ITransferReservesArgs): Promise<InstructionResult<null>> {
    const tokenBondingAcct = (await this.getTokenBonding(tokenBonding))!;
    const state = (await this.getState())!;
    const isNative =
      tokenBondingAcct.baseMint.equals(NATIVE_MINT) ||
      tokenBondingAcct.baseMint.equals(state.wrappedSolMint);
    const baseMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.baseMint
    );
    const instructions: anchor.web3.TransactionInstruction[] = [];

    if (!tokenBondingAcct.reserveAuthority) {
      throw new Error(
        "Cannot transfer reserves on a bonding account with no reserve authority"
      );
    }

    if (!destination && isNative) {
      destination = destinationWallet;
    }

    const destAcct =
      destination &&
      (await this.provider.connection.getAccountInfo(destination));

    // Destination is a wallet, need to get the ATA
    if (
      !isNative &&
      (!destAcct || destAcct.owner.equals(anchor.web3.SystemProgram.programId))
    ) {
      const ataDestination = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        tokenBondingAcct.baseMint,
        destinationWallet,
        false // Explicitly don't allow owner off curve. You need to pass destination as an already created thing to do this
      );
      if (!(await this.accountExists(ataDestination))) {
        instructions.push(
          Token.createAssociatedTokenAccountInstruction(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            tokenBondingAcct.baseMint,
            ataDestination,
            destinationWallet,
            payer
          )
        );
      }

      destination = ataDestination;
    }

    const common = {
      tokenBonding,
      reserveAuthority:
        reserveAuthority ||
        (tokenBondingAcct.reserveAuthority! as anchor.web3.PublicKey),
      baseMint: tokenBondingAcct.baseMint,
      baseStorage: tokenBondingAcct.baseStorage,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
    const args = {
      amount: toBN(amount, baseMint),
    };
    if (isNative) {
      instructions.push(
        await this.program.methods
          .transferReservesNativeV0(args)
          .accounts({
            common,
            destination: destination!,
            state: state.publicKey,
            wrappedSolMint: state.wrappedSolMint,
            mintAuthority: (
              await this.wrappedSolMintAuthorityKey(this.programId)
            )[0],
            solStorage: state.solStorage,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .instruction()
      );
    } else {
      instructions.push(
        await this.program.methods
          .transferReservesV0(args)
          .accounts({
            common,
            destination: destination!,
          })
          .instruction()
      );
    }
    return {
      output: null,
      signers: [],
      instructions,
    };
  }

  /**
   * Runs {@link closeInstructions}
   * @param args
   */
  async close(args: ICloseArgs): Promise<string> {
    try {
      const tokenObj = await this.closeInstructions(args);
      const tx = new web3.Transaction().add(...tokenObj.instructions);
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
      const signature = await this.provider.sendAndConfirm(
        tx,
        tokenObj.signers
      );
      console.log("sell ", signature);
      return signature;
    } catch (error) {
      console.log("error is", error);
      return "";
    }
  }

  /**
   * Instructions to close the bonding curve
   *
   * @param param0
   * @returns
   */
  async closeInstructions({
    tokenBonding,
    generalAuthority,
    refund = this.provider.publicKey,
  }: ICloseArgs): Promise<InstructionResult<null>> {
    const tokenBondingAcct = (await this.getTokenBonding(tokenBonding))!;

    if (!tokenBondingAcct.generalAuthority) {
      throw new Error(
        "Cannot close a bonding account with no general authority"
      );
    }

    return {
      output: null,
      signers: [],
      instructions: [
        await this.program.methods
          .closeTokenBondingV0()
          .accounts({
            refund,
            tokenBonding,
            generalAuthority:
              generalAuthority ||
              (tokenBondingAcct.generalAuthority! as anchor.web3.PublicKey),
            targetMint: tokenBondingAcct.targetMint,
            baseStorage: tokenBondingAcct.baseStorage,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
      ],
    };
  }

  async getUnixTime(): Promise<number> {
    const acc = await this.provider.connection.getAccountInfo(
      anchor.web3.SYSVAR_CLOCK_PUBKEY
    );
    //@ts-ignore
    return Number(acc!.data.readBigInt64LE(8 * 4));
  }

  async getState(): Promise<
    (IProgramState & { publicKey: anchor.web3.PublicKey }) | null
  > {
    if (this.state) {
      return this.state;
    }

    const stateAddress = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state", "utf-8")],
      this.programId
    )[0];

    const stateRaw =
      await this.program.account.programStateV0.fetchNullable(stateAddress);

    const state: IProgramState | null = stateRaw
      ? {
          ...stateRaw,
          publicKey: stateAddress,
        }
      : null;
    if (state) {
      this.state = state;
    }

    return state;
  }

  async getAccount<T>(
    key: anchor.web3.PublicKey,
    decoder: TypedAccountParser<T>
  ): Promise<T | null> {
    const account = await this.provider.connection.getAccountInfo(key);

    if (account) {
      return decoder(key, account);
    }

    return null;
  }

  getTokenBonding(
    tokenBondingKey: anchor.web3.PublicKey
  ): Promise<ITokenBonding | null> {
    return this.getAccount(tokenBondingKey, this.tokenBondingDecoder);
  }

  async tokenBondingKey(
    targetMint: anchor.web3.PublicKey,
    index: number = 0,
    programId: anchor.web3.PublicKey
  ): Promise<[anchor.web3.PublicKey, number]> {
    const pad: any = Buffer.alloc(2);
    new BN(index, 16, "le").toArrayLike(Buffer).copy(pad);
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token-bonding", "utf-8"), targetMint!.toBuffer(), pad],
      programId
    );
  }

  async accountExists(account: anchor.web3.PublicKey): Promise<boolean> {
    return Boolean(await this.provider.connection.getAccountInfo(account));
  }

  getCurve(curveKey: anchor.web3.PublicKey): Promise<ICurve | null> {
    return this.getAccount(curveKey, this.curveDecoder);
  }

  /**
   * Given some reserves and supply, get a pricing model for a curve at `key`.
   *
   * @param key
   * @param baseAmount
   * @param targetSupply
   * @param goLiveUnixTime
   * @returns
   */
  async getPricingCurve(
    key: anchor.web3.PublicKey,
    baseAmount: number,
    targetSupply: number,
    goLiveUnixTime: number
  ): Promise<IPricingCurve> {
    const curve = await this.getCurve(key);
    return fromCurve(curve, baseAmount, targetSupply, goLiveUnixTime);
  }

  async getPricing(
    tokenBondingKey: anchor.web3.PublicKey | undefined
  ): Promise<BondingPricing | undefined> {
    const hierarchy = await this.getBondingHierarchy(tokenBondingKey);
    if (hierarchy) {
      return new BondingPricing({
        hierarchy: hierarchy,
      });
    }
  }

  async getBondingHierarchy(
    tokenBondingKey: anchor.web3.PublicKey | undefined,
    stopAtMint?: anchor.web3.PublicKey | undefined
  ): Promise<BondingHierarchy | undefined> {
    if (!tokenBondingKey) {
      return;
    }

    const [wrappedSolMint, tokenBonding] = await Promise.all([
      this.getState().then((s) => s?.wrappedSolMint!),
      this.getTokenBonding(tokenBondingKey),
    ]);

    if (stopAtMint?.equals(NATIVE_MINT)) {
      stopAtMint = wrappedSolMint;
    }

    if (!tokenBonding) {
      return;
    }

    const pricingCurve = await this.getBondingPricingCurve(tokenBondingKey);

    const parentKey = (
      await this.tokenBondingKey(tokenBonding.baseMint, 0, this.programId)
    )[0];
    const ret = new BondingHierarchy({
      parent: stopAtMint?.equals(tokenBonding.baseMint)
        ? undefined
        : await this.getBondingHierarchy(parentKey, stopAtMint),
      tokenBonding,
      pricingCurve,
      wrappedSolMint,
    });
    (ret.parent || ({} as any)).child = ret;
    return ret;
  }

  /**
   * Get a class capable of displaying pricing information or this token bonding at its current reserve and supply
   *
   * @param tokenBonding
   * @returns
   */
  async getBondingPricingCurve(
    tokenBonding: anchor.web3.PublicKey
  ): Promise<IPricingCurve> {
    const tokenBondingAcct = (await this.getTokenBonding(tokenBonding))!;
    const targetMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.targetMint
    );
    const baseMint = await getMintInfo(
      this.provider,
      tokenBondingAcct.baseMint
    );
    const baseStorage = await getTokenAccount(
      this.provider,
      tokenBondingAcct.baseStorage
    );

    return await this.getPricingCurve(
      tokenBondingAcct.curve,
      amountAsNum(
        tokenBondingAcct.ignoreExternalReserveChanges
          ? tokenBondingAcct.reserveBalanceFromBonding
          : baseStorage.amount,
        baseMint
      ),
      amountAsNum(
        tokenBondingAcct.ignoreExternalSupplyChanges
          ? tokenBondingAcct.supplyFromBonding
          : targetMint.supply,
        targetMint
      ),
      tokenBondingAcct.goLiveUnixTime.toNumber()
    );
  }

  async wrappedSolMintAuthorityKey(
    programId: anchor.web3.PublicKey = this.programId
  ): Promise<[anchor.web3.PublicKey, number]> {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("wrapped-sol-authority", "utf-8")],
      programId
    );
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
      console.log(
        "Fee in function for",
        "HIGH",
        " :",
        data.result.priorityFeeEstimate
      );
      return Math.floor(data.result.priorityFeeEstimate);
    } catch (error) {
      return 0;
    }
  }

  async getTokenBalance(
    baseAddress: string,
    baseDecimal: number,
    targetAddress: any,
    targetDecimal: number
  ) {
    try {
      const infoes = await this.connection.getMultipleAccountsInfo([
        new anchor.web3.PublicKey(this.provider.publicKey.toBase58()),
      ]);
      console.log("getTokenBalance ", infoes);
      let baseBalance = await this.getUserBalance({
        address: this.provider.publicKey,
        token: baseAddress,
      });
      let targetBalance = await this.getUserBalance({
        address: this.provider.publicKey,
        token: targetAddress,
      });
      let solBalance = 0;

      if (infoes[0]) {
        solBalance = infoes[0].lamports / 1000_000_000;
      }

      return {
        base: baseBalance,
        target: targetBalance,
        sol: solBalance,
      };
    } catch (error) {
      console.log("erorror ", error);
      return {
        base: 0,
        target: 0,
        sol: 0,
      };
    }
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
      return infoes.value.uiAmount ? infoes.value.uiAmount : 0;
    } catch (error) {
      console.log("getUserBalance ", error);
      return 0;
    }
  }
}
