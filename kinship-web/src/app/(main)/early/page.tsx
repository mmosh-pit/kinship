import { getPayload } from "payload";
import config from "@payload-config";
import EarlyPageClient from "./EarlyPageClient";
import type { EarlyPageData } from "./EarlyPageClient";

export const dynamic = "force-dynamic";

export default async function EarlyPage() {
  const payload = await getPayload({ config });

  let data: EarlyPageData = {};

  try {
    const result = await payload.findGlobal({
      slug: "early-access-page",
      overrideAccess: true,
    });
    data = result as EarlyPageData;
  } catch {
    // DB not available — client will use hardcoded fallbacks
  }

  return <EarlyPageClient data={data} />;
}
