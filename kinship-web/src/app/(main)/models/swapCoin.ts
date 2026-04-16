import { Coin } from "./coin";

export type SwapCoin = Coin & { balance: number; value: number };
