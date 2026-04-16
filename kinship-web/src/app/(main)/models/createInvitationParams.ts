import { ProfileInfo } from "./profileInfo";
import { FrostWallet } from "@/utils/frostWallet";

export type CreateInvitationParams = {
  profileInfo: ProfileInfo;
  amount: number;
  wallet: FrostWallet;
  name: string;
  pronouns: string;
  seniority: number;
};
