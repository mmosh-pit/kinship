export interface JwtPayload {
  userId: string;
  email: string;
  role?: string;
}

// @fastify/jwt reads this to type request.user
declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: JwtPayload;
  }
}

export interface SocketMessage {
  chatId: string;
  agentId: string;
  content: string;
  namespaces?: string[];
  systemPrompt?: string;
}
