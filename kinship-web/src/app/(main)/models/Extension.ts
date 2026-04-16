type Extension = {
  type: 'linkedin' | 'bluesky' | 'x';
  email: string;
  password: string;
  instructions: string;
  userId?: string;
  botId?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export default Extension;
