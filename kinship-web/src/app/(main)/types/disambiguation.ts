export interface AmbiguousRecipient {
  wallet: string;
  display: string;
  first_name: string;
  last_name: string;
  username: string;
}

export interface DisambiguationResponse {
  type: "disambiguation";
  ambiguous: {
    [key: string]: AmbiguousRecipient[];
  };
  original_query: string;
  instructions: string;
}

export interface SelectedRecipients {
  [key: string]: AmbiguousRecipient[];
}