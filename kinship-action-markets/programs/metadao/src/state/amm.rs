use anchor_lang::prelude::*;

use crate::errors::MetaDaoError;

/// Constant-product AMM with an accumulating price oracle.
///
/// Invariant: `base_reserve * quote_reserve = k` (up to fees and TWAP drift).
/// Price is expressed as `quote_reserve / base_reserve` and is updated as a
/// time-weighted accumulator: on every interaction we add
/// `current_price * slots_elapsed` to `twap_accumulator`.
#[account]
#[derive(InitSpace)]
pub struct Amm {
    pub proposal: Pubkey,
    pub side: AmmSide,

    pub base_mint: Pubkey,   // conditional governance token
    pub quote_mint: Pubkey,  // conditional quote token (e.g. USDC)
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,

    pub base_reserve: u64,
    pub quote_reserve: u64,

    /// Sum of (price * slots) observed, scaled by PRICE_SCALE.
    pub twap_accumulator: u128,
    /// Last slot at which the accumulator was updated.
    pub last_update_slot: u64,
    /// Slot at which the market was first observed (for TWAP denominator).
    pub initialized_slot: u64,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AmmSide {
    Pass,
    Fail,
}

/// Price fixed-point scaling. `price = quote_reserve * PRICE_SCALE / base_reserve`.
pub const PRICE_SCALE: u128 = 1_000_000_000_000; // 1e12

/// Swap fee in basis points (0.30%).
pub const SWAP_FEE_BPS: u64 = 30;
pub const BPS_DENOM: u64 = 10_000;

impl Amm {
    /// Current spot price as a fixed-point number (quote per base, scaled by PRICE_SCALE).
    pub fn spot_price(&self) -> Result<u128> {
        require!(self.base_reserve > 0, MetaDaoError::EmptyReserves);
        Ok((self.quote_reserve as u128)
            .checked_mul(PRICE_SCALE)
            .unwrap()
            .checked_div(self.base_reserve as u128)
            .unwrap())
    }

    /// Update the TWAP accumulator to include the period since `last_update_slot`.
    /// Call this BEFORE mutating reserves so the *previous* price gets weighted
    /// by the time it was actually in effect.
    pub fn accumulate_twap(&mut self, current_slot: u64) -> Result<()> {
        if self.base_reserve == 0 || self.quote_reserve == 0 {
            self.last_update_slot = current_slot;
            return Ok(());
        }

        let elapsed = current_slot.saturating_sub(self.last_update_slot);
        if elapsed == 0 {
            return Ok(());
        }

        let price = self.spot_price()?;
        let contribution = price
            .checked_mul(elapsed as u128)
            .ok_or(MetaDaoError::MathOverflow)?;

        self.twap_accumulator = self
            .twap_accumulator
            .checked_add(contribution)
            .ok_or(MetaDaoError::MathOverflow)?;
        self.last_update_slot = current_slot;
        Ok(())
    }

    /// Time-weighted average price over the full market lifetime.
    /// Returns 0 if the market was never traded.
    pub fn twap(&self, end_slot: u64) -> Result<u128> {
        let duration = end_slot.saturating_sub(self.initialized_slot);
        if duration == 0 {
            return Ok(0);
        }

        // Include the final tail segment at the current spot price.
        let tail_elapsed = end_slot.saturating_sub(self.last_update_slot);
        let tail = if tail_elapsed > 0 && self.base_reserve > 0 {
            self.spot_price()?
                .checked_mul(tail_elapsed as u128)
                .ok_or(MetaDaoError::MathOverflow)?
        } else {
            0
        };

        let total = self
            .twap_accumulator
            .checked_add(tail)
            .ok_or(MetaDaoError::MathOverflow)?;

        Ok(total.checked_div(duration as u128).unwrap_or(0))
    }

    /// Quote a base-in -> quote-out swap (sell base).
    /// Uses constant product: (x + dx*(1-fee)) * (y - dy) = x * y
    pub fn quote_base_to_quote(&self, amount_in: u64) -> Result<u64> {
        require!(amount_in > 0, MetaDaoError::ZeroAmount);
        require!(
            self.base_reserve > 0 && self.quote_reserve > 0,
            MetaDaoError::EmptyReserves
        );

        let amount_in_after_fee = (amount_in as u128)
            .checked_mul((BPS_DENOM - SWAP_FEE_BPS) as u128)
            .unwrap()
            .checked_div(BPS_DENOM as u128)
            .unwrap();

        let numerator = amount_in_after_fee
            .checked_mul(self.quote_reserve as u128)
            .ok_or(MetaDaoError::MathOverflow)?;
        let denominator = (self.base_reserve as u128)
            .checked_add(amount_in_after_fee)
            .ok_or(MetaDaoError::MathOverflow)?;

        let out = numerator.checked_div(denominator).unwrap();
        require!(out < self.quote_reserve as u128, MetaDaoError::InsufficientLiquidity);
        Ok(out as u64)
    }

    /// Quote a quote-in -> base-out swap (buy base).
    pub fn quote_quote_to_base(&self, amount_in: u64) -> Result<u64> {
        require!(amount_in > 0, MetaDaoError::ZeroAmount);
        require!(
            self.base_reserve > 0 && self.quote_reserve > 0,
            MetaDaoError::EmptyReserves
        );

        let amount_in_after_fee = (amount_in as u128)
            .checked_mul((BPS_DENOM - SWAP_FEE_BPS) as u128)
            .unwrap()
            .checked_div(BPS_DENOM as u128)
            .unwrap();

        let numerator = amount_in_after_fee
            .checked_mul(self.base_reserve as u128)
            .ok_or(MetaDaoError::MathOverflow)?;
        let denominator = (self.quote_reserve as u128)
            .checked_add(amount_in_after_fee)
            .ok_or(MetaDaoError::MathOverflow)?;

        let out = numerator.checked_div(denominator).unwrap();
        require!(out < self.base_reserve as u128, MetaDaoError::InsufficientLiquidity);
        Ok(out as u64)
    }
}
