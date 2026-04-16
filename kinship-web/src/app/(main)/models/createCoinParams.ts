import React from "react";
import { Candidate } from "./candidate";
import { FrostWallet } from "@/utils/frostWallet";
import { ConnectionContextState } from "@/utils/connection";

export type CreateCoinParams = {
  username: string;
  name: string;
  symbol: string;
  description: string;
  imageFile: File | null;
  preview: string;
  wallet: FrostWallet;
  multiplier: number;
  supply: number;
  initialPrice: number;
  type: string;
  baseToken: any;
  connection:ConnectionContextState
  setMintingStatus: React.Dispatch<React.SetStateAction<string>>;
};

export type CreateProjectCoinParams = {
  username: string;
  name: string;
  symbol: string;
  description: string;
  imageFile: File | null;
  preview: string;
  wallet: FrostWallet;
  multiplier: number;
  supply: number;
  initialPrice: number;
  type: string;
  baseToken: any;
  candidate: Candidate;
  position: string;
  connect:ConnectionContextState

  setMintingStatus: React.Dispatch<React.SetStateAction<string>>;
};
