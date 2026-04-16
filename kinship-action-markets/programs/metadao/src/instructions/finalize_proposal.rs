use anchor_lang::prelude::*;

use crate::errors::MetaDaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(mut, has_one = dao, has_one = pass_amm, has_one = fail_amm)]
    pub proposal: Account<'info, Proposal>,

    pub dao: Account<'info, Dao>,

    #[account(mut)]
    pub pass_amm: Account<'info, Amm>,
    #[account(mut)]
    pub fail_amm: Account<'info, Amm>,
}

pub fn handler(ctx: Context<FinalizeProposal>) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    require!(proposal.state == ProposalState::Pending, MetaDaoError::ProposalNotPending);
    require!(clock.slot >= proposal.finalize_slot, MetaDaoError::MarketStillOpen);

    // Freeze final TWAPs up to the finalize slot.
    let pass = &mut ctx.accounts.pass_amm;
    let fail = &mut ctx.accounts.fail_amm;
    pass.accumulate_twap(proposal.finalize_slot)?;
    fail.accumulate_twap(proposal.finalize_slot)?;

    let pass_twap = pass.twap(proposal.finalize_slot)?;
    let fail_twap = fail.twap(proposal.finalize_slot)?;

    msg!("PASS TWAP: {}", pass_twap);
    msg!("FAIL TWAP: {}", fail_twap);

    // Require PASS > FAIL * (1 + threshold_bps / 10_000)
    let threshold_numerator =
        (BPS_DENOM as u128) + ctx.accounts.dao.pass_threshold_bps as u128;
    let fail_adjusted = fail_twap
        .checked_mul(threshold_numerator)
        .ok_or(MetaDaoError::MathOverflow)?
        .checked_div(BPS_DENOM as u128)
        .unwrap();

    proposal.state = if pass_twap > fail_adjusted {
        ProposalState::Passed
    } else {
        ProposalState::Failed
    };

    msg!("Proposal {} finalized as {:?}", proposal.number, proposal.state);
    Ok(())
}
