import { Coin } from "./coin";

export type CommunityAPIResult = {
  _id?: string;
  data: Community;
  profileAddress: string;
  completed?: boolean;
};

export type Community = {
  name: string;
  username: string;
  description: string;
  symbol: string;
  passImage: string;
  image: string;
  topics: string[];
  coin: Coin;
  creatorRoyalties: string;
  invitation: string;
  invitationPrice: string;
  inviteImg: string;
  passPrice: string;
  promoterRoyalties: string;
  scoutRoyalties: string;
  invitationDiscount: string;
  coinImage: string;
  lut: string;
  project: string;
  seniority: number;
  telegram: string;
  tokenAddress: string;
};
