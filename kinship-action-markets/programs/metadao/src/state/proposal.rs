use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub dao: Pubkey,
    pub proposer: Pubkey,
    pub number: u64,
    #[max_len(200)]
    pub description_uri: String,

    /// Program to invoke if this proposal passes.
    pub target_program: Pubkey,
    /// Serialized instruction data for the CPI.
    #[max_len(512)]
    pub instruction_data: Vec<u8>,
    /// Accounts passed through in the CPI (metas).
    #[max_len(10)]
    pub target_accounts: Vec<TargetAccount>,

    pub created_slot: u64,
    pub finalize_slot: u64,
    pub state: ProposalState,

    pub pass_amm: Pubkey,
    pub fail_amm: Pubkey,

    /// Mint for collateralized PASS-conditional governance tokens.
    pub pass_mint: Pubkey,
    /// Mint for collateralized FAIL-conditional governance tokens.
    pub fail_mint: Pubkey,
    /// Mint for PASS-conditional quote (e.g. USDC) tokens.
    pub pass_quote_mint: Pubkey,
    /// Mint for FAIL-conditional quote tokens.
    pub fail_quote_mint: Pubkey,

    pub bump: u8,
}

impl Proposal {
    pub const MAX_URI_LEN: usize = 200;
    pub const MAX_IX_DATA_LEN: usize = 512;
    pub const MAX_ACCOUNTS: usize = 10;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ProposalState {
    Pending,
    Passed,
    Failed,
    Executed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, Debug)]
pub struct TargetAccount {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}
