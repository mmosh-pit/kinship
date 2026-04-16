//! MetaDAO — Futarchy-based governance on Solana.
//!
//! Full working flow:
//!   1. `initialize_dao`     — create a DAO tied to a governance token.
//!   2. `create_proposal`    — spawns PASS/FAIL conditional mints and AMMs.
//!   3. `mint_conditional`   — lock underlying, receive PASS + FAIL tokens.
//!   4. `add_liquidity`      — seed PASS/FAIL AMMs with conditional tokens.
//!   5. `swap`               — trade on the AMMs; TWAPs accumulate.
//!   6. `finalize_proposal`  — after market window, compare TWAPs, set outcome.
//!   7. `execute_proposal`   — if Passed, CPI the stored instruction.
//!   8. `redeem_conditional` — burn winning-side tokens for underlying.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod metadao {
    use super::*;

    pub fn initialize_dao(ctx: Context<InitializeDao>, params: DaoParams) -> Result<()> {
        instructions::initialize_dao::handler(ctx, params)
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        description_uri: String,
        instruction_data: Vec<u8>,
        target_accounts: Vec<TargetAccount>,
        target_program: Pubkey,
    ) -> Result<()> {
        instructions::create_proposal::handler(
            ctx,
            description_uri,
            instruction_data,
            target_accounts,
            target_program,
        )
    }

    pub fn mint_conditional(ctx: Context<MintConditional>, amount: u64) -> Result<()> {
        instructions::mint_conditional::handler(ctx, amount)
    }

    pub fn redeem_conditional(ctx: Context<RedeemConditional>, amount: u64) -> Result<()> {
        instructions::redeem_conditional::handler(ctx, amount)
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        base_amount: u64,
        quote_amount: u64,
    ) -> Result<()> {
        instructions::swap::add_liquidity_handler(ctx, base_amount, quote_amount)
    }

    pub fn swap(
        ctx: Context<Swap>,
        direction: SwapDirection,
        amount_in: u64,
        min_amount_out: u64,
    ) -> Result<()> {
        instructions::swap::swap_handler(ctx, direction, amount_in, min_amount_out)
    }

    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        instructions::finalize_proposal::handler(ctx)
    }

    pub fn execute_proposal<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteProposal<'info>>,
    ) -> Result<()> {
        instructions::execute_proposal::handler(ctx)
    }
}
