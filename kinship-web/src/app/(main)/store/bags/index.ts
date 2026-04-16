import { atom } from "jotai";

export type BagsCoin = {
  image: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  balance: number;
  decimals: number;
  usdcPrice: number;
  mmoshPrice: number;
  parentKey?: string;
  topup?: boolean
};

export type BagsCoins = {
  network: BagsCoin | null;
  stable: BagsCoin | null;
  native: BagsCoin | null;
  memecoins: BagsCoin[];
  exosystem: BagsCoin[];
};

export type BagsNFT = {
  image: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  balance: number;
  metadata: any;
  parentKey?: string;
  topup?: boolean
};

export type BagsNFTAssets = {
  profiles: BagsNFT[];
  passes: BagsNFT[];
  badges: BagsNFT[];
  exosystem: BagsNFT[];
};

export type ConnectionConfirm = {
  module: string
  status: string;
  data: any;
};

export type RequestConfirm = {
  module: string
  data: any;
};

export type BagsNotifier = {
  message: string
  type: string;
};

export const bagsCoins = atom<BagsCoins | null>(null);

export const bagsNfts = atom<BagsNFTAssets | null>(null);

export const bagsBalance = atom(0);

export const genesisProfileUser = atom(false);


export const bagsConfirmation = atom<RequestConfirm | null>(null);
export const bagsModalAck = atom<ConnectionConfirm | null>(null);

export const bagsNotifier = atom<BagsNotifier | null>(null);