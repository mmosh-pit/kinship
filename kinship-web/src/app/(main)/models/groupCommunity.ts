type GroupCommunity = {
  name: string;
  description: string;
  asset: string;
  passImage: string;
  coinSymbol: string;
  symbol: string;
  groups: Group[];
  founder: Founder;
};

type Founder = {
  name: string;
  username: string;
  bio: string;
  image: string;
  pronouns: string;
  descriptor: string;
  nouns: string;
  profile: string;
};

type Group = {
  handle: string;
  privacy: string;
  assetPrice: number;
};
