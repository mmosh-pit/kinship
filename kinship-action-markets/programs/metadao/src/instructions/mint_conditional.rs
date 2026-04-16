use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::errors::MetaDaoError;
use crate::state::*;

/// Deposit `amount` of the underlying governance (or quote) token,
/// receive `amount` of the corresponding PASS and FAIL conditional tokens.
/// After finalization, holders redeem the winning side 1:1; the losing
/// side becomes worthless but the deposit is refundable via its pair.
#[derive(Accounts)]
pub struct MintConditional<'info> {
    #[account(has_one = dao)]
    pub proposal: Account<'info, Proposal>,

    pub dao: Account<'info, Dao>,

    /// The underlying mint (must be either dao.token_mint or the quote side
    /// encoded by pass_mint/fail_mint pairing).
    #[account(mut)]
    pub underlying_mint: Account<'info, Mint>,

    /// Escrow that holds the underlying while conditional tokens are out.
    #[account(
        init_if_needed,
        payer = user,
        token::mint = underlying_mint,
        token::authority = proposal,
        seeds = [b"escrow", proposal.key().as_ref(), underlying_mint.key().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = underlying_mint,
        token::authority = user,
    )]
    pub user_underlying: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pass_mint: Account<'info, Mint>,
    #[account(mut)]
    pub fail_mint: Account<'info, Mint>,

    #[account(mut, token::mint = pass_mint, token::authority = user)]
    pub user_pass: Account<'info, TokenAccount>,
    #[account(mut, token::mint = fail_mint, token::authority = user)]
    pub user_fail: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<MintConditional>, amount: u64) -> Result<()> {
    require!(amount > 0, MetaDaoError::ZeroAmount);

    // Confirm the underlying matches one of the two valid pairings on this proposal.
    let proposal = &ctx.accounts.proposal;
    let dao = &ctx.accounts.dao;
    let underlying_key = ctx.accounts.underlying_mint.key();
    let pass_key = ctx.accounts.pass_mint.key();
    let fail_key = ctx.accounts.fail_mint.key();

    let governance_pair = pass_key == proposal.pass_mint
        && fail_key == proposal.fail_mint
        && underlying_key == dao.token_mint;
    let quote_pair = pass_key == proposal.pass_quote_mint
        && fail_key == proposal.fail_quote_mint;
    require!(governance_pair || quote_pair, MetaDaoError::AccountMismatch);

    // Move user underlying into escrow.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_underlying.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // Mint matching PASS + FAIL to user.
    let proposal_key = proposal.key();
    let seeds: &[&[u8]] = &[
        b"proposal",
        proposal.dao.as_ref(),
        &proposal.number.to_le_bytes(),
        &[proposal.bump],
    ];
    let signer = &[seeds];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.pass_mint.to_account_info(),
                to: ctx.accounts.user_pass.to_account_info(),
                authority: proposal.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.fail_mint.to_account_info(),
                to: ctx.accounts.user_fail.to_account_info(),
                authority: proposal.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    msg!("Minted {} PASS+FAIL against proposal {}", amount, proposal_key);
    Ok(())
}
