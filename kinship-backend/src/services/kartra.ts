// Kartra CRM lead tagging — mirrors pkg/common/app/send_kartra_notification.go
export async function sendKartraNotification(
  tag: string,
  name: string,
  lastName: string,
  email: string
) {
  const appId = process.env.KARTRA_APP_ID;
  const apiKey = process.env.KARTRA_API_KEY;
  const apiPassword = process.env.KARTRA_API_PASSWORD;
  const baseUrl = process.env.KARTRA_API_BASE;

  if (!appId || !apiKey || !apiPassword || !baseUrl) return;

  const params = new URLSearchParams({
    app_id: appId,
    api_key: apiKey,
    api_password: apiPassword,
    "lead[first_name]": name,
    "lead[last_name]": lastName,
    "lead[email]": email,
    "actions[0][cmd]": "assign_tag",
    "actions[0][tag_name]": tag,
  });

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[kartra] API error:", body);
    }
  } catch (err) {
    console.error("[kartra] Request failed:", err);
  }
}
