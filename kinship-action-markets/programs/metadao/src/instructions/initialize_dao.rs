use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::*;

#[derive(Accounts)]
pub struct InitializeDao<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Dao::INIT_SPACE,
        seeds = [b"dao", token_mint.key().as_ref()],
        bump,
    )]
    pub dao: Account<'info, Dao>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = token_mint,
        token::authority = dao,
        seeds = [b"treasury", dao.key().as_ref()],
        bump,
    )]
    pub treasury: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeDao>, params: DaoParams) -> Result<()> {
    let dao = &mut ctx.accounts.dao;
    dao.authority = ctx.accounts.authority.key();
    dao.token_mint = ctx.accounts.token_mint.key();
    dao.treasury = ctx.accounts.treasury.key();
    dao.proposal_count = 0;
    dao.pass_threshold_bps = params.pass_threshold_bps;
    dao.market_duration_slots = params.market_duration_slots;
    dao.min_proposer_stake = params.min_proposer_stake;
    dao.bump = ctx.bumps.dao;

    msg!("DAO initialized: {}", dao.key());
    Ok(())
}
