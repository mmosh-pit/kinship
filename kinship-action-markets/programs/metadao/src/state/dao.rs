use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Dao {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub treasury: Pubkey,
    pub proposal_count: u64,
    /// Basis points PASS TWAP must exceed FAIL TWAP by to pass.
    pub pass_threshold_bps: u16,
    pub market_duration_slots: u64,
    pub min_proposer_stake: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DaoParams {
    pub pass_threshold_bps: u16,
    pub market_duration_slots: u64,
    pub min_proposer_stake: u64,
}
