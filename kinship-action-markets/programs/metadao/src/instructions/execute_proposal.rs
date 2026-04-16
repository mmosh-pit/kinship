use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use crate::errors::MetaDaoError;
use crate::state::*;

/// Once a proposal is Passed, anyone can execute it. The proposal PDA signs
/// the CPI via its seeds, so the target program sees the DAO itself as the
/// authority — this is how treasury instructions (e.g. transfer from DAO
/// treasury) are authorized.
#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut, has_one = dao)]
    pub proposal: Account<'info, Proposal>,

    pub dao: Account<'info, Dao>,

    /// CHECK: executable program being invoked. Verified against proposal.target_program.
    #[account(executable, address = proposal.target_program)]
    pub target_program: UncheckedAccount<'info>,
    // Remaining accounts: must match proposal.target_accounts in the same order.
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, ExecuteProposal<'info>>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    require!(proposal.state == ProposalState::Passed, MetaDaoError::ProposalNotPassed);
    require_eq!(
        ctx.remaining_accounts.len(),
        proposal.target_accounts.len(),
        MetaDaoError::AccountMismatch
    );

    // Build the target instruction from stored metas + live accounts.
    let mut metas: Vec<AccountMeta> = Vec::with_capacity(proposal.target_accounts.len());
    for (stored, live) in proposal.target_accounts.iter().zip(ctx.remaining_accounts.iter()) {
        require_keys_eq!(stored.pubkey, *live.key, MetaDaoError::AccountMismatch);
        metas.push(AccountMeta {
            pubkey: stored.pubkey,
            is_signer: stored.is_signer,
            is_writable: stored.is_writable,
        });
    }

    let ix = Instruction {
        program_id: proposal.target_program,
        accounts: metas,
        data: proposal.instruction_data.clone(),
    };

    let seeds: &[&[u8]] = &[
        b"proposal",
        proposal.dao.as_ref(),
        &proposal.number.to_le_bytes(),
        &[proposal.bump],
    ];
    let signer = &[seeds];

    invoke_signed(&ix, ctx.remaining_accounts, signer)?;

    proposal.state = ProposalState::Executed;
    msg!("Proposal {} executed", proposal.number);
    Ok(())
}
