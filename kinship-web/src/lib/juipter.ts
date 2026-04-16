const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';


export interface JupiterPrice {
  priceChange24h: number;
  usdPrice: number;
  blockId: number;
  decimals: number
}


export interface JupiterPriceResponse {
    [key: string]: JupiterPrice;
}

export async function getJupiterPrices(tokenIds?: string[]): Promise<JupiterPriceResponse> {
  try {

    const ids = `${SOL_MINT},${USDC_MINT}`;
    const response = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch prices');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching Jupiter prices:', error);
    throw error;
  }
}

/**
 * Get SOL price in USD
 */
export async function getSolPrice(): Promise<number> {
  try {
    const response = await getJupiterPrices();

    return response[SOL_MINT]?.usdPrice || 0;
  } catch (error) {
    console.error('Error getting SOL price:', error);
    throw error;
  }
}

/**
 * Get USDC price (usually ~$1)
 */
export async function getUsdcPrice(): Promise<number> {
  try {
    const response = await getJupiterPrices();
    return response[USDC_MINT]?.usdPrice || 1;
  } catch (error) {
    console.error('Error getting USDC price:', error);
    throw error;
  }
}

/**
 * Convert SOL amount to USDC
 */
export async function convertSolToUSDC(solAmount: number): Promise<number> {
  try {
    const solPrice = await getSolPrice();
    return solAmount * solPrice;
  } catch (error) {
    console.error('Error converting SOL to USDC:', error);
    throw error;
  }
}

/**
 * Convert USDC amount to SOL
 */
export async function convertUSDCToSol(usdcAmount: number): Promise<number> {
  try {
    const solPrice = await getSolPrice();
    return usdcAmount / solPrice;
  } catch (error) {
    console.error('Error converting USDC to SOL:', error);
    throw error;
  }
}