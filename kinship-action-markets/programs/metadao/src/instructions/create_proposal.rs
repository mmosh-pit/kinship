use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::MetaDaoError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(description_uri: String, instruction_data: Vec<u8>, target_accounts: Vec<TargetAccount>)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub dao: Account<'info, Dao>,

    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [b"proposal", dao.key().as_ref(), &dao.proposal_count.to_le_bytes()],
        bump,
    )]
    pub proposal: Account<'info, Proposal>,

    // ---- Conditional mints (all authority = proposal PDA) ----
    #[account(
        init,
        payer = proposer,
        mint::decimals = governance_mint.decimals,
        mint::authority = proposal,
        seeds = [b"pass_mint", proposal.key().as_ref()],
        bump,
    )]
    pub pass_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = proposer,
        mint::decimals = governance_mint.decimals,
        mint::authority = proposal,
        seeds = [b"fail_mint", proposal.key().as_ref()],
        bump,
    )]
    pub fail_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = proposer,
        mint::decimals = quote_mint.decimals,
        mint::authority = proposal,
        seeds = [b"pass_quote", proposal.key().as_ref()],
        bump,
    )]
    pub pass_quote_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = proposer,
        mint::decimals = quote_mint.decimals,
        mint::authority = proposal,
        seeds = [b"fail_quote", proposal.key().as_ref()],
        bump,
    )]
    pub fail_quote_mint: Account<'info, Mint>,

    // ---- AMMs ----
    #[account(
        init,
        payer = proposer,
        space = 8 + Amm::INIT_SPACE,
        seeds = [b"amm", proposal.key().as_ref(), b"pass"],
        bump,
    )]
    pub pass_amm: Account<'info, Amm>,

    #[account(
        init,
        payer = proposer,
        space = 8 + Amm::INIT_SPACE,
        seeds = [b"amm", proposal.key().as_ref(), b"fail"],
        bump,
    )]
    pub fail_amm: Account<'info, Amm>,

    // ---- AMM vaults (authority = corresponding amm PDA) ----
    #[account(
        init,
        payer = proposer,
        token::mint = pass_mint,
        token::authority = pass_amm,
        seeds = [b"vault_base", pass_amm.key().as_ref()],
        bump,
    )]
    pub pass_base_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = proposer,
        token::mint = pass_quote_mint,
        token::authority = pass_amm,
        seeds = [b"vault_quote", pass_amm.key().as_ref()],
        bump,
    )]
    pub pass_quote_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = proposer,
        token::mint = fail_mint,
        token::authority = fail_amm,
        seeds = [b"vault_base", fail_amm.key().as_ref()],
        bump,
    )]
    pub fail_base_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = proposer,
        token::mint = fail_quote_mint,
        token::authority = fail_amm,
        seeds = [b"vault_quote", fail_amm.key().as_ref()],
        bump,
    )]
    pub fail_quote_vault: Account<'info, TokenAccount>,

    // Underlying mints — used only to copy `decimals`.
    #[account(address = dao.token_mint)]
    pub governance_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateProposal>,
    description_uri: String,
    instruction_data: Vec<u8>,
    target_accounts: Vec<TargetAccount>,
    target_program: Pubkey,
) -> Result<()> {
    require!(description_uri.len() <= Proposal::MAX_URI_LEN, MetaDaoError::UriTooLong);
    require!(instruction_data.len() <= Proposal::MAX_IX_DATA_LEN, MetaDaoError::InstructionTooLarge);
    require!(target_accounts.len() <= Proposal::MAX_ACCOUNTS, MetaDaoError::TooManyAccounts);

    let clock = Clock::get()?;
    let dao = &mut ctx.accounts.dao;
    let proposal = &mut ctx.accounts.proposal;

    proposal.dao = dao.key();
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.number = dao.proposal_count;
    proposal.description_uri = description_uri;
    proposal.target_program = target_program;
    proposal.instruction_data = instruction_data;
    proposal.target_accounts = target_accounts;
    proposal.created_slot = clock.slot;
    proposal.finalize_slot = clock.slot + dao.market_duration_slots;
    proposal.state = ProposalState::Pending;
    proposal.pass_amm = ctx.accounts.pass_amm.key();
    proposal.fail_amm = ctx.accounts.fail_amm.key();
    proposal.pass_mint = ctx.accounts.pass_mint.key();
    proposal.fail_mint = ctx.accounts.fail_mint.key();
    proposal.pass_quote_mint = ctx.accounts.pass_quote_mint.key();
    proposal.fail_quote_mint = ctx.accounts.fail_quote_mint.key();
    proposal.bump = ctx.bumps.proposal;

    // Initialize both AMMs with empty reserves. Liquidity is seeded by
    // the first mint_conditional + add-liquidity flow in real usage; for
    // this prototype, the proposer seeds it externally via mint + swap.
    let pass_amm = &mut ctx.accounts.pass_amm;
    pass_amm.proposal = proposal.key();
    pass_amm.side = AmmSide::Pass;
    pass_amm.base_mint = ctx.accounts.pass_mint.key();
    pass_amm.quote_mint = ctx.accounts.pass_quote_mint.key();
    pass_amm.base_vault = ctx.accounts.pass_base_vault.key();
    pass_amm.quote_vault = ctx.accounts.pass_quote_vault.key();
    pass_amm.base_reserve = 0;
    pass_amm.quote_reserve = 0;
    pass_amm.twap_accumulator = 0;
    pass_amm.last_update_slot = clock.slot;
    pass_amm.initialized_slot = clock.slot;
    pass_amm.bump = ctx.bumps.pass_amm;

    let fail_amm = &mut ctx.accounts.fail_amm;
    fail_amm.proposal = proposal.key();
    fail_amm.side = AmmSide::Fail;
    fail_amm.base_mint = ctx.accounts.fail_mint.key();
    fail_amm.quote_mint = ctx.accounts.fail_quote_mint.key();
    fail_amm.base_vault = ctx.accounts.fail_base_vault.key();
    fail_amm.quote_vault = ctx.accounts.fail_quote_vault.key();
    fail_amm.base_reserve = 0;
    fail_amm.quote_reserve = 0;
    fail_amm.twap_accumulator = 0;
    fail_amm.last_update_slot = clock.slot;
    fail_amm.initialized_slot = clock.slot;
    fail_amm.bump = ctx.bumps.fail_amm;

    dao.proposal_count = dao.proposal_count.checked_add(1).unwrap();
    msg!("Proposal {} created", proposal.number);
    Ok(())
}
