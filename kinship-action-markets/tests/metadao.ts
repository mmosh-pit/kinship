import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { Metadao } from "../target/types/metadao";
import { ExampleTarget } from "../target/types/example_target";
import { assert } from "chai";

describe("metadao — full futarchy flow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const metadao = anchor.workspace.Metadao as Program<Metadao>;
  const exampleTarget = anchor.workspace.ExampleTarget as Program<ExampleTarget>;

  const authority = (provider.wallet as anchor.Wallet).payer;

  // Underlying mints
  let govMint: PublicKey;
  let quoteMint: PublicKey;

  // DAO-level accounts
  let daoPda: PublicKey;
  let treasuryPda: PublicKey;

  // Proposal-level accounts
  let proposalPda: PublicKey;
  let passMintPda: PublicKey;
  let failMintPda: PublicKey;
  let passQuoteMintPda: PublicKey;
  let failQuoteMintPda: PublicKey;
  let passAmmPda: PublicKey;
  let failAmmPda: PublicKey;
  let passBaseVault: PublicKey;
  let passQuoteVault: PublicKey;
  let failBaseVault: PublicKey;
  let failQuoteVault: PublicKey;

  // Target program state
  const counter = Keypair.generate();

  before(async () => {
    govMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
    quoteMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);

    [daoPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("dao"), govMint.toBuffer()],
      metadao.programId
    );
    [treasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), daoPda.toBuffer()],
      metadao.programId
    );
  });

  it("initializes DAO", async () => {
    await metadao.methods
      .initializeDao({
        passThresholdBps: 100, // 1%
        marketDurationSlots: new BN(20), // short for testing
        minProposerStake: new BN(0),
      })
      .accounts({
        dao: daoPda,
        tokenMint: govMint,
        treasury: treasuryPda,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const dao = await metadao.account.dao.fetch(daoPda);
    assert.equal(dao.proposalCount.toNumber(), 0);
    assert.equal(dao.passThresholdBps, 100);
  });

  it("initializes the example target counter", async () => {
    // The proposal PDA will be the authority on the counter.
    [proposalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), daoPda.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8)],
      metadao.programId
    );

    await exampleTarget.methods
      .initialize()
      .accounts({
        counter: counter.publicKey,
        authority: proposalPda,
        payer: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counter])
      .rpc();

    const c = await exampleTarget.account.counter.fetch(counter.publicKey);
    assert.equal(c.value.toNumber(), 0);
    assert.equal(c.authority.toBase58(), proposalPda.toBase58());
  });

  it("creates a proposal", async () => {
    // PDAs
    [passMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pass_mint"), proposalPda.toBuffer()],
      metadao.programId
    );
    [failMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fail_mint"), proposalPda.toBuffer()],
      metadao.programId
    );
    [passQuoteMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pass_quote"), proposalPda.toBuffer()],
      metadao.programId
    );
    [failQuoteMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fail_quote"), proposalPda.toBuffer()],
      metadao.programId
    );
    [passAmmPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("amm"), proposalPda.toBuffer(), Buffer.from("pass")],
      metadao.programId
    );
    [failAmmPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("amm"), proposalPda.toBuffer(), Buffer.from("fail")],
      metadao.programId
    );
    [passBaseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_base"), passAmmPda.toBuffer()],
      metadao.programId
    );
    [passQuoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_quote"), passAmmPda.toBuffer()],
      metadao.programId
    );
    [failBaseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_base"), failAmmPda.toBuffer()],
      metadao.programId
    );
    [failQuoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_quote"), failAmmPda.toBuffer()],
      metadao.programId
    );

    // Build the instruction that the proposal should execute if it passes:
    // exampleTarget.bump(counter, delta=42)
    const bumpIx = await exampleTarget.methods
      .bump(new BN(42))
      .accounts({ counter: counter.publicKey, authority: proposalPda })
      .instruction();

    const targetAccounts = bumpIx.keys.map((k) => ({
      pubkey: k.pubkey,
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    }));

    await metadao.methods
      .createProposal(
        "ipfs://proposal-42",
        bumpIx.data,
        targetAccounts,
        exampleTarget.programId
      )
      .accounts({
        dao: daoPda,
        proposal: proposalPda,
        passMint: passMintPda,
        failMint: failMintPda,
        passQuoteMint: passQuoteMintPda,
        failQuoteMint: failQuoteMintPda,
        passAmm: passAmmPda,
        failAmm: failAmmPda,
        passBaseVault,
        passQuoteVault,
        failBaseVault,
        failQuoteVault,
        governanceMint: govMint,
        quoteMint: quoteMint,
        proposer: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const p = await metadao.account.proposal.fetch(proposalPda);
    assert.deepEqual(p.state, { pending: {} });
  });

  it("mints conditional tokens and seeds both AMMs", async () => {
    // Give the user some gov + quote.
    const userGov = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      govMint,
      authority.publicKey
    );
    const userQuote = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      quoteMint,
      authority.publicKey
    );
    await mintTo(provider.connection, authority, govMint, userGov, authority, 10_000_000);
    await mintTo(provider.connection, authority, quoteMint, userQuote, authority, 10_000_000);

    // Create user conditional ATAs.
    const userPass = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      passMintPda,
      authority.publicKey
    );
    const userFail = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      failMintPda,
      authority.publicKey
    );
    const userPassQuote = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      passQuoteMintPda,
      authority.publicKey
    );
    const userFailQuote = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      failQuoteMintPda,
      authority.publicKey
    );

    const [govEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), proposalPda.toBuffer(), govMint.toBuffer()],
      metadao.programId
    );
    const [quoteEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), proposalPda.toBuffer(), quoteMint.toBuffer()],
      metadao.programId
    );

    // Mint 5M gov into PASS+FAIL gov conditionals.
    await metadao.methods
      .mintConditional(new BN(5_000_000))
      .accounts({
        proposal: proposalPda,
        dao: daoPda,
        underlyingMint: govMint,
        escrow: govEscrow,
        userUnderlying: userGov,
        passMint: passMintPda,
        failMint: failMintPda,
        userPass: userPass,
        userFail: userFail,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Mint 5M quote into PASS+FAIL quote conditionals.
    await metadao.methods
      .mintConditional(new BN(5_000_000))
      .accounts({
        proposal: proposalPda,
        dao: daoPda,
        underlyingMint: quoteMint,
        escrow: quoteEscrow,
        userUnderlying: userQuote,
        passMint: passQuoteMintPda,
        failMint: failQuoteMintPda,
        userPass: userPassQuote,
        userFail: userFailQuote,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Seed PASS AMM: 1M base + 1M quote → price = 1.0
    await metadao.methods
      .addLiquidity(new BN(1_000_000), new BN(1_000_000))
      .accounts({
        proposal: proposalPda,
        amm: passAmmPda,
        baseVault: passBaseVault,
        quoteVault: passQuoteVault,
        userBase: userPass,
        userQuote: userPassQuote,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Seed FAIL AMM: 1M base + 1M quote → price = 1.0
    await metadao.methods
      .addLiquidity(new BN(1_000_000), new BN(1_000_000))
      .accounts({
        proposal: proposalPda,
        amm: failAmmPda,
        baseVault: failBaseVault,
        quoteVault: failQuoteVault,
        userBase: userFail,
        userQuote: userFailQuote,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const userPassAcc = await getAccount(provider.connection, userPass);
    const userFailAcc = await getAccount(provider.connection, userFail);
    assert.equal(userPassAcc.amount.toString(), "4000000"); // 5M - 1M LP
    assert.equal(userFailAcc.amount.toString(), "4000000");

    // Stash for later tests.
    (global as any).userPass = userPass;
    (global as any).userFail = userFail;
    (global as any).userPassQuote = userPassQuote;
    (global as any).userFailQuote = userFailQuote;
    (global as any).userGov = userGov;
    (global as any).userQuote = userQuote;
    (global as any).govEscrow = govEscrow;
    (global as any).quoteEscrow = quoteEscrow;
  });

  it("trades: buys PASS base (bullish on passing), sells FAIL base (bearish on failing)", async () => {
    const userPass = (global as any).userPass;
    const userFail = (global as any).userFail;
    const userPassQuote = (global as any).userPassQuote;
    const userFailQuote = (global as any).userFailQuote;

    // On PASS market: swap quote -> base (buy base, raising base price).
    await metadao.methods
      .swap({ quoteToBase: {} } as any, new BN(500_000), new BN(0))
      .accounts({
        proposal: proposalPda,
        amm: passAmmPda,
        baseVault: passBaseVault,
        quoteVault: passQuoteVault,
        userBase: userPass,
        userQuote: userPassQuote,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // On FAIL market: swap base -> quote (sell base, lowering base price).
    await metadao.methods
      .swap({ baseToQuote: {} } as any, new BN(500_000), new BN(0))
      .accounts({
        proposal: proposalPda,
        amm: failAmmPda,
        baseVault: failBaseVault,
        quoteVault: failQuoteVault,
        userBase: userFail,
        userQuote: userFailQuote,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const pass = await metadao.account.amm.fetch(passAmmPda);
    const fail = await metadao.account.amm.fetch(failAmmPda);

    // PASS: quote went in, base came out → base cheaper? No — quote/base ratio went UP = price up.
    // FAIL: base went in, quote came out → quote/base ratio went DOWN = price down.
    const passPrice =
      Number(pass.quoteReserve.toString()) / Number(pass.baseReserve.toString());
    const failPrice =
      Number(fail.quoteReserve.toString()) / Number(fail.baseReserve.toString());

    console.log(`  PASS spot: ${passPrice.toFixed(4)}`);
    console.log(`  FAIL spot: ${failPrice.toFixed(4)}`);
    assert.isAbove(passPrice, failPrice, "PASS market should forecast higher than FAIL");
  });

  it("waits for the market window to close, then finalizes", async () => {
    // Advance past the 20-slot window.
    const p = await metadao.account.proposal.fetch(proposalPda);
    let currentSlot = await provider.connection.getSlot();
    while (currentSlot < p.finalizeSlot.toNumber()) {
      // Send a no-op transfer to burn a slot.
      await provider.connection.requestAirdrop(Keypair.generate().publicKey, 1);
      await new Promise((r) => setTimeout(r, 400));
      currentSlot = await provider.connection.getSlot();
    }

    await metadao.methods
      .finalizeProposal()
      .accounts({
        proposal: proposalPda,
        dao: daoPda,
        passAmm: passAmmPda,
        failAmm: failAmmPda,
      })
      .rpc();

    const finalized = await metadao.account.proposal.fetch(proposalPda);
    console.log(`  final state: ${JSON.stringify(finalized.state)}`);
    assert.deepEqual(finalized.state, { passed: {} });
  });

  it("executes the passed proposal (CPI into example-target)", async () => {
    await metadao.methods
      .executeProposal()
      .accounts({
        proposal: proposalPda,
        dao: daoPda,
        targetProgram: exampleTarget.programId,
      })
      .remainingAccounts([
        { pubkey: counter.publicKey, isSigner: false, isWritable: true },
        { pubkey: proposalPda, isSigner: false, isWritable: false },
      ])
      .rpc();

    const c = await exampleTarget.account.counter.fetch(counter.publicKey);
    assert.equal(c.value.toNumber(), 42, "counter should have been bumped by proposal CPI");

    const p = await metadao.account.proposal.fetch(proposalPda);
    assert.deepEqual(p.state, { executed: {} });
  });

  it("redeems PASS tokens 1:1 for underlying gov", async () => {
    const userPass = (global as any).userPass;
    const userGov = (global as any).userGov;
    const govEscrow = (global as any).govEscrow;

    const beforeGov = await getAccount(provider.connection, userGov);

    await metadao.methods
      .redeemConditional(new BN(1_000_000))
      .accounts({
        proposal: proposalPda,
        underlyingMint: govMint,
        escrow: govEscrow,
        userUnderlying: userGov,
        winningMint: passMintPda,
        userWinning: userPass,
        user: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterGov = await getAccount(provider.connection, userGov);
    const delta = afterGov.amount - beforeGov.amount;
    assert.equal(delta.toString(), "1000000", "should receive 1:1 underlying for burned PASS");
  });
});
