//! Simple program used to demonstrate CPI execution of a passed proposal.
//! It holds a counter that only a passed-proposal PDA can increment.

use anchor_lang::prelude::*;

declare_id!("ExampLeTargetProgram11111111111111111111111");

#[program]
pub mod example_target {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.counter.value = 0;
        ctx.accounts.counter.authority = ctx.accounts.authority.key();
        Ok(())
    }

    pub fn bump(ctx: Context<Bump>, delta: u64) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        require_keys_eq!(ctx.accounts.authority.key(), counter.authority, ErrorCode::Unauthorized);
        counter.value = counter.value.checked_add(delta).unwrap();
        msg!("Counter bumped to {}", counter.value);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = payer, space = 8 + Counter::INIT_SPACE)]
    pub counter: Account<'info, Counter>,
    /// CHECK: stored as the only account authorized to bump the counter.
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Bump<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub authority: Pubkey,
    pub value: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Not authorized")]
    Unauthorized,
}
