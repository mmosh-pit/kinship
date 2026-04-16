export interface UserCheckpointMasterSelection {
  checkpoint_id: string;     // (the _id from master list)
  type: "challenge" | "ability" | "cause";
  category: string;
  tag: string;
}

export interface UserCheckpointRequest {
//   user_id: string;
  selections: UserCheckpointMasterSelection[];
}
