import { Candidate } from "./candidate";

export type CandidateInfo = {
  candidate: Candidate | null;
  firstOponent: Candidate | null;
  secondOponent: Candidate | null;
};
