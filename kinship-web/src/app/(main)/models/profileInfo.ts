export type ProfileLineage = {
  parent: string;
  gparent: string;
  ggparent: string;
  gggparent: string;
  gensis: string;
};

type Profile = {
  name: string,
  address: string;
  image: string;
};

export type ProfileInfo = {
  mmoshBalance: number;
  usdcBalance: number;
  solBalance: number;
  profileLineage: ProfileLineage;
  profile: Profile;
};
