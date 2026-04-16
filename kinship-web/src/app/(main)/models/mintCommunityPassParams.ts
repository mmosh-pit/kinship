import React from "react";
import { Community } from "./community";
import { FrostWallet } from "@/utils/frostWallet";

export type MintCommunityPassParams = {
  wallet: FrostWallet;
  setMintStatus: React.Dispatch<React.SetStateAction<string>>;
  community: Community;
  projectInfo: any;
  profile: string;
};
