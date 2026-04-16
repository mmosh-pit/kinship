# MetaDAO

A decentralized autonomous organization (DAO) project built on futarchy — governance by prediction markets.

## Overview

MetaDAO uses conditional prediction markets to make decisions. Instead of token-weighted voting, proposals are evaluated by markets that forecast whether a given decision will improve a chosen success metric (e.g., token price, treasury value). The market with the higher forecast wins, and the decision is executed automatically.

## Features

- Futarchy-based governance — decisions made by conditional prediction markets, not token votes
- Constant-product AMM for PASS/FAIL markets with swap fees (30 bps)
- Time-weighted average price (TWAP) oracle accumulating on every trade
- Conditional token mint/redeem — deposit underlying, receive PASS+FAIL pair
- On-chain finalization comparing PASS vs FAIL TWAP with a configurable threshold
- CPI execution of the passed proposal's stored instruction (arbitrary target program)

## Tech Stack

- **Blockchain**: Solana
- **Smart Contracts**: Anchor / Rust
- **Frontend**: TypeScript / React
- **Package Manager**: npm / yarn

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Rust and Cargo
- Solana CLI
- Anchor framework

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd metadao-project

# Install dependencies
npm install

# Build the programs
anchor build
```

### Running Tests

```bash
anchor test
```

### Local Development

```bash
# Start a local Solana validator
solana-test-validator

# Deploy to localnet
anchor deploy
```

## Project Structure

```
metadao-project/
├── programs/
│   ├── metadao/                # Main futarchy program
│   │   ├── src/
│   │   │   ├── lib.rs          # Entry point
│   │   │   ├── errors.rs
│   │   │   ├── state/          # Dao, Proposal, Amm
│   │   │   └── instructions/   # 8 instruction handlers
│   │   └── Cargo.toml
│   └── example-target/         # Demo program invoked via CPI
│       ├── src/lib.rs
│       └── Cargo.toml
├── tests/metadao.ts            # Full end-to-end flow
├── app/src/client.ts           # TypeScript SDK wrapper
├── scripts/init-dao.ts         # Example: initialize a DAO
├── migrations/deploy.ts
├── Anchor.toml
├── Cargo.toml
├── package.json
└── tsconfig.json
```

## Instructions

1. `initialize_dao` — create a DAO bound to a governance token
2. `create_proposal` — spawns PASS/FAIL conditional mints + AMMs, stores the CPI instruction to execute on pass
3. `mint_conditional` — lock underlying, receive matching PASS + FAIL tokens
4. `add_liquidity` — seed an AMM with conditional base+quote tokens
5. `swap` — trade on either PASS or FAIL market; TWAP accumulates automatically
6. `finalize_proposal` — after market close, compare TWAPs, set Passed/Failed
7. `execute_proposal` — if Passed, CPI the stored instruction with the proposal PDA as signer
8. `redeem_conditional` — burn winning-side tokens 1:1 for underlying

## First-time setup

After cloning, sync the program ID with your local keypair:

```bash
yarn install          # or npm install
anchor build          # generates target/deploy/metadao-keypair.json
anchor keys sync      # updates declare_id! in lib.rs to match
anchor build          # rebuild with the real program ID
anchor test           # spins up a local validator and runs tests/metadao.ts
```

## Deploying to devnet

```bash
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet
```

## Caveats (important)

This is a working **prototype**, not production code:

- **TWAP is gameable.** The oracle uses a simple last-observation-weighted accumulator. A well-timed trade near market close can skew it. Production futarchy uses bounded/clamped observations or Uniswap V3–style tick-accumulated oracles.
- **No LP tokens.** Liquidity added via `add_liquidity` cannot be withdrawn until finalization. Fine for short-lived markets; bad for long-lived ones.
- **No slippage or MEV protection** beyond a `min_amount_out` parameter on swaps.
- **Unaudited.** The conditional-token mint/redeem flow, in particular, handles real value and must be reviewed carefully before any mainnet deployment.

Intended as a reference implementation of the futarchy pattern on Solana — useful for learning, adapting, or as a starting point for a hardened version.

## Contributing

Contributions are welcome. Please open an issue to discuss changes before submitting a PR.

## License

MIT
