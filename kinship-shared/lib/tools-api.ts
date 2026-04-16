/**
 * Tools API Client
 */

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export interface ToolConnection {
  id: string;
  toolName: string;
  status: string;
  externalUserId?: string;
  externalHandle?: string;
  connectedAt: string;
}

export interface VerifyToolResult {
  success: boolean;
  error?: string;
  externalHandle?: string;
  externalUserId?: string;
  credentials?: Record<string, string>;
}

/**
 * Verify tool credentials with backend (without connecting to a worker)
 * Used during agent creation flow before the worker exists
 */
export async function verifyToolCredentials(
  toolName: string,
  credentials: Record<string, string>
): Promise<VerifyToolResult> {
  try {
    const response = await fetch(`${AGENT_API_URL}/api/tools/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool_name: toolName,
        credentials,
      }),
    });

    const data = await response.json();

    return {
      success: data.success,
      error: data.error,
      externalHandle: data.external_handle,
      externalUserId: data.external_user_id,
      credentials: data.credentials,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/**
 * Connect a tool to a worker for a specific user
 * Each user has their own tool connections (per-user credentials)
 */
export async function connectToolToWorker(
  workerId: string,
  toolName: string,
  credentials: Record<string, string>,
  wallet: string
): Promise<{ success: boolean; error?: string; connection?: ToolConnection }> {
  const response = await fetch(
    `${AGENT_API_URL}/api/tools/worker/${workerId}/connect`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool_name: toolName,
        credentials,
        wallet,
      }),
    }
  );

  const data = await response.json();

  // Handle 403 access denied
  if (response.status === 403) {
    return {
      success: false,
      error: data.detail || "Access denied: you do not have access to this worker",
    };
  }

  return {
    success: data.success,
    error: data.error,
    connection: data.connection
      ? {
          id: data.connection.id,
          toolName: data.connection.tool_name,
          status: data.connection.status,
          externalUserId: data.connection.external_user_id,
          externalHandle: data.connection.external_handle,
          connectedAt: data.connection.connected_at,
        }
      : undefined,
  };
}

/**
 * Disconnect a tool from a worker for a specific user
 * Only affects the user's own connection
 */
export async function disconnectToolFromWorker(
  workerId: string,
  toolName: string,
  wallet: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${AGENT_API_URL}/api/tools/worker/${workerId}/disconnect/${toolName}?wallet=${encodeURIComponent(wallet)}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to disconnect");
  }

  return response.json();
}

/**
 * List connected tools for a worker for a specific user
 * Returns only the user's own connections
 */
export async function listWorkerToolConnections(
  workerId: string,
  wallet: string
): Promise<ToolConnection[]> {
  const response = await fetch(
    `${AGENT_API_URL}/api/tools/worker/${workerId}/connections?wallet=${encodeURIComponent(wallet)}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch connections");
  }

  const data = await response.json();

  return data.connections.map((c: Record<string, unknown>) => ({
    id: c.id,
    toolName: c.tool_name,
    status: c.status,
    externalUserId: c.external_user_id,
    externalHandle: c.external_handle,
    connectedAt: c.connected_at,
  }));
}