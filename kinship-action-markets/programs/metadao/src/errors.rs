use anchor_lang::prelude::*;

#[error_code]
pub enum MetaDaoError {
    #[msg("Description URI exceeds max length")]
    UriTooLong,
    #[msg("Instruction data exceeds max size")]
    InstructionTooLarge,
    #[msg("Too many accounts in target instruction")]
    TooManyAccounts,
    #[msg("Proposal is not in pending state")]
    ProposalNotPending,
    #[msg("Proposal did not pass")]
    ProposalNotPassed,
    #[msg("Proposal has already been executed")]
    AlreadyExecuted,
    #[msg("Market is still open; cannot finalize yet")]
    MarketStillOpen,
    #[msg("Market has closed")]
    MarketClosed,
    #[msg("Reserves are empty")]
    EmptyReserves,
    #[msg("Insufficient liquidity for requested swap")]
    InsufficientLiquidity,
    #[msg("Output below minimum — slippage exceeded")]
    SlippageExceeded,
    #[msg("Amount must be non-zero")]
    ZeroAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Account metas passed to execute do not match proposal")]
    AccountMismatch,
    #[msg("Wrong AMM side")]
    WrongAmmSide,
}
