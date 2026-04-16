import * as anchor from "@coral-xyz/anchor";
import { Connectivity as ProjectConn } from "@/anchor/project";
import { Connection } from "@solana/web3.js";
import { web3Consts } from "@/anchor/web3Consts";
import { FrostWallet } from "@/utils/frostWallet";

export const getCommunityProjectInfo = async (
  wallet: FrostWallet,
  address: string,
) => {
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
    confirmTransactionInitialTimeout: 120000
  });
  const env = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "processed",
  });

  anchor.setProvider(env);
  const projectConn: ProjectConn = new ProjectConn(
    env,
    web3Consts.programID,
    new anchor.web3.PublicKey(address),
  );

  const projectInfo = await projectConn.getProjectUserInfo(address);

  return projectInfo;
};
