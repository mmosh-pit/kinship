use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::MetaDaoError;
use crate::state::*;

/// After finalization:
///   - If proposal Passed: PASS tokens redeem 1:1 for underlying; FAIL is worthless.
///   - If proposal Failed: FAIL tokens redeem 1:1 for underlying; PASS is worthless.
#[derive(Accounts)]
pub struct RedeemConditional<'info> {
    pub proposal: Account<'info, Proposal>,

    #[account(mut)]
    pub underlying_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"escrow", proposal.key().as_ref(), underlying_mint.key().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut, token::mint = underlying_mint, token::authority = user)]
    pub user_underlying: Account<'info, TokenAccount>,

    /// The winning-side mint (PASS mint if Passed, FAIL mint if Failed).
    #[account(mut)]
    pub winning_mint: Account<'info, Mint>,
    #[account(mut, token::mint = winning_mint, token::authority = user)]
    pub user_winning: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RedeemConditional>, amount: u64) -> Result<()> {
    require!(amount > 0, MetaDaoError::ZeroAmount);

    let proposal = &ctx.accounts.proposal;
    let winning_key = ctx.accounts.winning_mint.key();

    let expected_winning = match proposal.state {
        ProposalState::Passed | ProposalState::Executed => {
            // On governance side, winner is pass_mint; on quote side, pass_quote_mint.
            if winning_key == proposal.pass_mint || winning_key == proposal.pass_quote_mint {
                winning_key
            } else {
                return err!(MetaDaoError::AccountMismatch);
            }
        }
        ProposalState::Failed => {
            if winning_key == proposal.fail_mint || winning_key == proposal.fail_quote_mint {
                winning_key
            } else {
                return err!(MetaDaoError::AccountMismatch);
            }
        }
        ProposalState::Pending => return err!(MetaDaoError::MarketStillOpen),
    };
    require_keys_eq!(winning_key, expected_winning, MetaDaoError::AccountMismatch);

    // Burn winning-side conditional tokens.
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.winning_mint.to_account_info(),
                from: ctx.accounts.user_winning.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // Release underlying from escrow.
    let seeds: &[&[u8]] = &[
        b"proposal",
        proposal.dao.as_ref(),
        &proposal.number.to_le_bytes(),
        &[proposal.bump],
    ];
    let signer = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.user_underlying.to_account_info(),
                authority: proposal.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    msg!("Redeemed {} of winning mint {}", amount, winning_key);
    Ok(())
}
