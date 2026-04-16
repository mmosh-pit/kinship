// Proxy to mmoshapi (Python FastAPI service) — mirrors pkg/common/app/get_ai_response.go
export async function fetchAIResponse(
  username: string,
  text: string,
  systemPrompt: string,
  namespaces: string[]
): Promise<string> {
  const baseUrl = process.env.AI_API_BASE;
  if (!baseUrl) return "";

  try {
    const res = await fetch(`${baseUrl}/generate/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        prompt: text,
        namespaces,
        system_promtp: systemPrompt, // typo preserved from Go original
      }),
    });

    if (!res.ok) return "";
    return await res.text();
  } catch (err) {
    console.error("[ai] fetchAIResponse failed:", err);
    return "";
  }
}
