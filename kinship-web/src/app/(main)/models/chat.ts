interface Participant {
  id: string;
  name: string;
  type: string;
  picture: string;
}

export interface Message {
  id: string;
  content: string;
  sender_id: string;
  type: string;
  created_at: string;
  sender: string;
  is_loading: boolean;
}

interface Agent {
  id: string;
  name: string;
  desc: string;
  image: string;
  key: string;
  symbol: string;
  system_prompt: string;
  creatorUsername: string;
  type: string;
  defaultmodel: string | null;
}

export interface Chat {
  id: string;
  participants: Participant[];
  messages: Message[];
  deactivated: boolean;
  chatAgent: Agent | null;
  lastMessage: Message | null;
}
