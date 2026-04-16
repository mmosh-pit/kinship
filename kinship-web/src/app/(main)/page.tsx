import { getPayload } from "payload";
import config from "@payload-config";
import LandingPage from "./LandingPageClient";

export const dynamic = "force-dynamic";

export type NavItem = {
  label: string;
  actionType: "scroll" | "link";
  sectionId?: string;
  url?: string;
};

export default async function Page() {
  const payload = await getPayload({ config });

  let layout: Record<string, any>[] = [];
  let navItems: NavItem[] = [];

  try {
    const [homepage, siteHeader] = await Promise.all([
      payload.findGlobal({ slug: "homepage", overrideAccess: true, depth: 2 }),
      payload.findGlobal({ slug: "site-header", overrideAccess: true }),
    ]);
    layout = (homepage?.layout as any[]) ?? [];
    navItems = (siteHeader?.navItems as NavItem[]) ?? [];
  } catch {
    // DB not yet migrated — fall through to empty defaults
  }

  return <LandingPage layout={layout} navItems={navItems} />;
}
