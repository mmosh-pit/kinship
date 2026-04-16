// Allowed checkpoint types
export type CheckpointType = "challenge" | "ability" | "cause";

// One checkpoint master entry structure
export interface CheckpointMasterEntry {
  type: CheckpointType;
  category: string;
  tags: string[]; // must be array of strings
}

// Request payload can be:
// - a single object, OR
// - an array of objects
export type CheckpointMasterRequest = 
  | CheckpointMasterEntry
  | CheckpointMasterEntry[];
