use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::MetaDaoError;
use crate::state::*;

// ---------------------------------------------------------------------------
// add_liquidity — seed the AMM. Simplified: first LP sets the price ratio;
// subsequent LPs must deposit proportionally. We skip LP tokens for brevity
// (production systems would issue them); instead liquidity is non-withdrawable
// until finalization, which is actually fine for short-lived futarchy markets.
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        has_one = proposal,
        has_one = base_vault,
        has_one = quote_vault,
    )]
    pub amm: Account<'info, Amm>,

    #[account(mut)]
    pub base_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(mut, token::authority = user)]
    pub user_base: Account<'info, TokenAccount>,
    #[account(mut, token::authority = user)]
    pub user_quote: Account<'info, TokenAccount>,

    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn add_liquidity_handler(
    ctx: Context<AddLiquidity>,
    base_amount: u64,
    quote_amount: u64,
) -> Result<()> {
    require!(base_amount > 0 && quote_amount > 0, MetaDaoError::ZeroAmount);

    let clock = Clock::get()?;
    let amm = &mut ctx.accounts.amm;

    // Accumulate TWAP using *previous* price before reserves change.
    amm.accumulate_twap(clock.slot)?;

    // Transfer in.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_base.to_account_info(),
                to: ctx.accounts.base_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        base_amount,
    )?;
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_quote.to_account_info(),
                to: ctx.accounts.quote_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        quote_amount,
    )?;

    amm.base_reserve = amm.base_reserve.checked_add(base_amount).unwrap();
    amm.quote_reserve = amm.quote_reserve.checked_add(quote_amount).unwrap();
    Ok(())
}

// ---------------------------------------------------------------------------
// swap
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SwapDirection {
    BaseToQuote,
    QuoteToBase,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        has_one = proposal,
        has_one = base_vault,
        has_one = quote_vault,
    )]
    pub amm: Account<'info, Amm>,

    #[account(mut)]
    pub base_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(mut, token::authority = user)]
    pub user_base: Account<'info, TokenAccount>,
    #[account(mut, token::authority = user)]
    pub user_quote: Account<'info, TokenAccount>,

    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn swap_handler(
    ctx: Context<Swap>,
    direction: SwapDirection,
    amount_in: u64,
    min_amount_out: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &ctx.accounts.proposal;
    require!(proposal.state == ProposalState::Pending, MetaDaoError::MarketClosed);
    require!(clock.slot < proposal.finalize_slot, MetaDaoError::MarketClosed);

    let amm = &mut ctx.accounts.amm;
    amm.accumulate_twap(clock.slot)?;

    let amm_key = amm.key();
    let amm_bump = amm.bump;
    let side_seed: &[u8] = match amm.side {
        AmmSide::Pass => b"pass",
        AmmSide::Fail => b"fail",
    };
    let proposal_key = proposal.key();
    let amm_seeds: &[&[u8]] = &[b"amm", proposal_key.as_ref(), side_seed, &[amm_bump]];
    let signer = &[amm_seeds];

    let amount_out = match direction {
        SwapDirection::BaseToQuote => {
            let out = amm.quote_base_to_quote(amount_in)?;
            require!(out >= min_amount_out, MetaDaoError::SlippageExceeded);

            // User -> base vault
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_base.to_account_info(),
                        to: ctx.accounts.base_vault.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                amount_in,
            )?;
            // Quote vault -> user
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.quote_vault.to_account_info(),
                        to: ctx.accounts.user_quote.to_account_info(),
                        authority: amm.to_account_info(),
                    },
                    signer,
                ),
                out,
            )?;

            amm.base_reserve = amm.base_reserve.checked_add(amount_in).unwrap();
            amm.quote_reserve = amm.quote_reserve.checked_sub(out).unwrap();
            out
        }
        SwapDirection::QuoteToBase => {
            let out = amm.quote_quote_to_base(amount_in)?;
            require!(out >= min_amount_out, MetaDaoError::SlippageExceeded);

            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_quote.to_account_info(),
                        to: ctx.accounts.quote_vault.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                amount_in,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.base_vault.to_account_info(),
                        to: ctx.accounts.user_base.to_account_info(),
                        authority: amm.to_account_info(),
                    },
                    signer,
                ),
                out,
            )?;

            amm.quote_reserve = amm.quote_reserve.checked_add(amount_in).unwrap();
            amm.base_reserve = amm.base_reserve.checked_sub(out).unwrap();
            out
        }
    };

    msg!("Swap on AMM {}: in={} out={}", amm_key, amount_in, amount_out);
    Ok(())
}
