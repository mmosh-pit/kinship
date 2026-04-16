export type Coin = {
  name: string;
  symbol: string;
  desc: string;
  token: string;
  image: string;
  decimals: number;
  is_memecoin?: boolean
};


export type CoinDetail = {
  base: Coin;
  target: Coin;
  token: string;
  symbol: string;
  bonding: string;
  status: string;
  pool: string;
  maxsupplyusd: number;
  expiredDate: string;
  creatorUsername: string;
};
