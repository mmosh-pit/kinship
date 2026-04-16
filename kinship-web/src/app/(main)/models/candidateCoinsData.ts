export type CandidateCoinsData = {
  againstResult: number;
  forResult: number;
  total: number;
  coin: {
    address: string;
    amount: number;
    name: string;
    symbol: string;
    image: string;
  };
};
