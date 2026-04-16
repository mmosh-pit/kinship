import React from "react";
import { Community } from "./community";
import { FrostWallet } from "@/utils/frostWallet";

export type MintInvitationParams = {
  amount: number;
  wallet: FrostWallet;
  setInvitationStatus: React.Dispatch<React.SetStateAction<string>>;
  pronouns?: string;
  userName?: string;
  community: Community;
  projectInfo: any;
};
