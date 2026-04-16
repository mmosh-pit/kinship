import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fetchAIResponse } from "../services/ai.js";

// CloudMailin inbound email webhook — mirrors pkg/mail/
// CloudMailin posts parsed email data as JSON to this endpoint.
// The AI service generates a reply which is sent back via CloudMailin SMTP.
export async function mailRoutes(fastify: FastifyInstance) {
  fastify.post("/mail", async (request, reply) => {
    const body = z
      .object({
        from: z.string(),
        to: z.string(),
        plain: z.string().optional(),
        html: z.string().optional(),
      })
      .passthrough()
      .parse(request.body);

    const text = body.plain ?? body.html ?? "";
    const response = await fetchAIResponse("VISITOR", text, "", ["PUBLIC"]);

    if (response) {
      await sendCloudMailinReply({
        from: body.to,
        to: body.from,
        subject: "AI Response",
        body: response,
      });
    }

    return reply.send({ ok: true });
  });
}

// ─── CloudMailin outbound helper ──────────────────────────────────────────────

async function sendCloudMailinReply(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
}) {
  const smtpUrl = process.env.CLOUDMAILIN_SMTP_URL;
  if (!smtpUrl) {
    console.warn("[mail] CLOUDMAILIN_SMTP_URL not set — skipping reply");
    return;
  }

  // CloudMailin has an HTTP send API; use that if SMTP isn't available
  // TODO: integrate cloudmailin-node SDK when available for Node.js
  // For now, log the response (implement with nodemailer + SMTP URL if needed)
  console.info("[mail] Would send reply to", opts.to, "subject:", opts.subject);
}
