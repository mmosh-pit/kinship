import { Candidate } from "./candidate";

export type CandidateCoinForm = {
  name: string;
  symbol: string;
  candidate: Candidate | null;
  position: string;
  bonding: string;
  description: string;
  supply: number;
  multiplier: number;
  initialPrice: number;
};
