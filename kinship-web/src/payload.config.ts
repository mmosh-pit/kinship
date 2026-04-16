import { gcsStorage } from "@payloadcms/storage-gcs";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import type { Block, CollectionConfig, GlobalConfig } from "payload";
import { buildConfig } from "payload";

// ─── Collections ─────────────────────────────────────────────────────────────

const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: { useAsTitle: "email" },
  fields: [{ name: "name", type: "text" }],
};

const Media: CollectionConfig = {
  slug: "media",
  upload: true,
  admin: { useAsTitle: "filename" },
  fields: [{ name: "alt", type: "text", label: "Alt Text" }],
};

const Posts: CollectionConfig = {
  slug: "posts",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "author", "publishedAt"],
  },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { description: "URL-friendly identifier, e.g. my-first-post" },
    },
    {
      name: "excerpt",
      type: "textarea",
      label: "Excerpt",
      admin: { description: "Short summary shown in post listings" },
    },
    { name: "featuredImage", type: "upload", relationTo: "media", label: "Featured Image" },
    { name: "content", type: "richText", label: "Content", editor: lexicalEditor({}) },
    { name: "author", type: "relationship", relationTo: "users", label: "Author" },
    {
      name: "tags",
      type: "array",
      label: "Tags",
      fields: [{ name: "tag", type: "text" }],
    },
    {
      name: "publishedAt",
      type: "date",
      label: "Published At",
      admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime" } },
    },
  ],
};

// ─── Blocks ───────────────────────────────────────────────────────────────────

const sectionIdField = {
  name: "sectionId",
  type: "text" as const,
  label: "Section ID",
  admin: {
    description: "Unique ID for in-page navigation (e.g. 'origin-story'). Reference this in the Site Header nav items.",
  },
};

const HeroBlock: Block = {
  slug: "hero",
  labels: { singular: "Hero", plural: "Heroes" },
  fields: [
    sectionIdField,
    { name: "backgroundImage", type: "upload", relationTo: "media", label: "Background Image" },
    { name: "title", type: "text", label: "Main Title" },
    { name: "subtitle", type: "textarea", label: "Subtitle / Description" },
    { name: "tagline", type: "text", label: "Tagline" },
    { name: "ctaText", type: "text", label: "CTA Button Text" },
  ],
};

const VideoSectionBlock: Block = {
  slug: "videoSection",
  labels: { singular: "Video Section", plural: "Video Sections" },
  fields: [
    sectionIdField,
    { name: "title", type: "text", label: "Section Title" },
    { name: "youtubeUrl", type: "text", label: "YouTube Embed URL" },
    { name: "description", type: "textarea", label: "Description" },
  ],
};

const RichTextSectionBlock: Block = {
  slug: "richTextSection",
  labels: { singular: "Rich Text Section", plural: "Rich Text Sections" },
  fields: [
    sectionIdField,
    { name: "heading", type: "text", label: "Heading" },
    { name: "subheading", type: "text", label: "Subheading" },
    { name: "body", type: "textarea", label: "Body Text", admin: { rows: 10 } },
    { name: "image", type: "upload", relationTo: "media", label: "Image (optional)" },
    { name: "imageUrl", type: "text", label: "Image URL (alternative to upload)" },
  ],
};

const CardsGridBlock: Block = {
  slug: "cardsGrid",
  labels: { singular: "Cards Grid", plural: "Cards Grids" },
  fields: [
    sectionIdField,
    { name: "sectionTitle", type: "text", label: "Section Title" },
    { name: "description", type: "textarea", label: "Section Description" },
    {
      name: "cards",
      type: "array",
      label: "Cards",
      fields: [
        { name: "title", type: "text", label: "Title" },
        { name: "subtitle", type: "text", label: "Subtitle / Theme" },
        { name: "description", type: "textarea", label: "Description" },
      ],
    },
  ],
};

// ─── Globals ──────────────────────────────────────────────────────────────────

const Homepage: GlobalConfig = {
  slug: "homepage",
  admin: { group: "Content" },
  fields: [
    {
      name: "layout",
      type: "blocks",
      label: "Page Sections",
      blocks: [HeroBlock, VideoSectionBlock, RichTextSectionBlock, CardsGridBlock],
    },
  ],
};

const SiteHeader: GlobalConfig = {
  slug: "site-header",
  label: "Site Header",
  admin: { group: "Content" },
  fields: [
    {
      name: "navItems",
      type: "array",
      label: "Navigation Items",
      fields: [
        {
          name: "label",
          type: "text",
          required: true,
        },
        {
          name: "actionType",
          type: "select",
          required: true,
          defaultValue: "scroll",
          options: [
            { label: "Scroll to section", value: "scroll" },
            { label: "Navigate to page", value: "link" },
          ],
        },
        {
          name: "sectionId",
          type: "text",
          admin: {
            condition: (_, siblingData) => siblingData?.actionType === "scroll",
            description: "ID of the section to scroll to, e.g. origin-story",
          },
        },
        {
          name: "url",
          type: "text",
          admin: {
            condition: (_, siblingData) => siblingData?.actionType === "link",
            description: "Page URL to navigate to, e.g. /blog",
          },
        },
      ],
    },
  ],
};

const EarlyAccessPage: GlobalConfig = {
  slug: "early-access-page",
  label: "Early Access Page",
  admin: { group: "Content" },
  fields: [
    {
      name: "heading",
      type: "text",
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "youtubeUrl",
      type: "text",
      label: "YouTube Embed URL",
    },
    {
      name: "socialLinks",
      type: "array",
      fields: [
        {
          name: "platform",
          type: "select",
          required: true,
          options: [
            { label: "Bluesky", value: "bluesky" },
            { label: "LinkedIn", value: "linkedin" },
            { label: "Substack", value: "substack" },
            { label: "Instagram", value: "instagram" },
            { label: "Facebook", value: "facebook" },
            { label: "Threads", value: "threads" },
            { label: "YouTube", value: "youtube" },
            { label: "TikTok", value: "tiktok" },
            { label: "X", value: "x" },
          ],
        },
        {
          name: "label",
          type: "text",
          required: true,
        },
        {
          name: "url",
          type: "text",
          admin: { description: "Leave empty to show the button as disabled" },
        },
      ],
    },
    {
      name: "bottomImageUrl",
      type: "text",
      label: "Bottom Decorative Image URL",
    },
  ],
};

// ─── Seed data ────────────────────────────────────────────────────────────────

const homepageSeed = [
  {
    blockType: "hero",
    blockName: "Hero",
    sectionId: "hero",
    title: "Where AI Belongs",
    subtitle:
      "Kinship Agents is where creators turn their life's work into living AI agents — and where their people can find them. A cooperative ecosystem governed by members and dedicated to transforming how we grow, connect, live, and work together.",
    tagline: "Change Yourself. Change Your Life. Change The World.",
    ctaText: "Join Early Access",
  },
  {
    blockType: "videoSection",
    blockName: "Origin Story",
    sectionId: "origin-story",
    title: "A creator marketplace for what matters the most.",
    youtubeUrl: "https://www.youtube.com/embed/OM5V7DlLa74",
    description:
      "Creators have always had platforms for their content. Kinship Agents is something different — a marketplace for living AI agents that carry forward the full depth of who you are. In this short film, our founder shares the unlikely path that led here, and what it means for creators, communities, and the people they serve.",
  },
  {
    blockType: "richTextSection",
    blockName: "AI Infrastructure",
    sectionId: "ai-infrastructure",
    heading: "AI is the Most Powerful Infrastructure Ever Built.",
    subheading: "And It's Pointed in the Wrong Direction.",
    body: "AI systems around the world are being optimized for engagement, efficiency, productivity, and profit.\n\nThe result: we're massively accelerating the velocity of a civilization already headed toward a cliff. Authoritarianism, poverty, mass displacement, disease, war, the mental health crisis, and planetary ecosystem collapse are the major symptoms of a society that is out of control and running on autopilot.\n\nThe only two options on the table are accelerate or regulate.\n\nUntil now.\n\nKinship is a new choice. A network where creators turn their deepest wisdom into living AI agents — and where those agents reach people everywhere, through an exchange and affiliate network that rewards real impact.\n\nWe're not standing outside the system pointing at what's broken. We're building inside it, with creators who know what it takes to create real change.\n\nAnd here's the thing… when you point AI agents at the deepest, most critical issues facing our society, then engagement, efficiency, productivity, and profit all follow.",
  },
  {
    blockType: "cardsGrid",
    blockName: "Platform",
    sectionId: "platform",
    sectionTitle: "Infrastructure for what comes next.",
    description:
      "A cooperative agent network, built on four integrated systems. Every Kinship agent is aware of the others — sharing context, coordinating with creators, cooperating on behalf of members. The result is a living ecosystem that compounds in value: for creators who build, for members who engage, and for the network as a whole.",
    cards: [
      {
        title: "Kinship Agents",
        subtitle: "The Experience",
        description:
          "Where members live, work, and play in an environment populated by caring, capable, and supportive Kinship Agents",
      },
      {
        title: "Kinship Studio",
        subtitle: "The Workshop",
        description:
          "Where creators build the agents that care, the adventures that transform, the tools that connect, and the experiences that matter.",
      },
      {
        title: "Kinship Exchange",
        subtitle: "The Economy",
        description:
          "An agent marketplace where value circulates. Creators earn royalties. Champions earn commissions. Citizens earn rewards.",
      },
      {
        title: "Kinship Intelligence",
        subtitle: "The Heart and Soul",
        description:
          "The orchestration layer that ensures every agent cooperates, all context is shared, and every member is honored across the entire network.",
      },
    ],
  },
  {
    blockType: "richTextSection",
    blockName: "Vibes",
    sectionId: "vibes",
    heading: "The Vibes Are Immaculate",
    body: "Creators set the Vibes, the tone, personality, style, and emotional texture of their agents, which are always, underneath it all, attuned to the Harmony, Empowerment, Artistry, Reason, Trust, and Synthesis (HEARTS) of the members.\n\nHEARTS is a scientific framework rooted in neuroscience, developmental psychology, motivation science, depth psychology, organizational development, and systems theory.\n\nThe conditions for individual, organizational, and ecosystem flourishing are well-understood, measurable, and now, for the first time, available throughout an agentic AI network.\n\nThese capacities aren't metrics or objectives. They are qualities that every agent monitors, every experience cultivates, and every interaction quietly supports.\n\nThey ensure coherence over chaos, cohesion over coercion, and cooperation over competition.",
  },
  {
    blockType: "cardsGrid",
    blockName: "Principles",
    sectionId: "principles",
    sectionTitle: "",
    description: "",
    cards: [
      {
        title: "Harmony",
        subtitle: "",
        description:
          "Connection that holds under pressure. The capacity to stay present, repair what breaks, and build deep, honest relationships of love and mutual care.",
      },
      {
        title: "Empowerment",
        subtitle: "",
        description:
          "Agency that comes from your center, with confidence, clarity, conviction, and the courage to show up in your full power.",
      },
      {
        title: "Artistry",
        subtitle: "",
        description:
          "Openness, versatility, and craft. The capacity to adapt, experiment, and refine your way through everything life has on offer.",
      },
      {
        title: "Reason",
        subtitle: "",
        description:
          "Purpose in motion. The capacity to align what you do with what matters the most — so meaning can be lived rather than declared.",
      },
      {
        title: "Trust",
        subtitle: "",
        description:
          "The deep capacity to feel safe in relationships and trust the process. Vulnerability, reliability and the sense that the world you inhabit is fundamentally sound.",
      },
      {
        title: "Synthesis",
        subtitle: "",
        description:
          "Complementary consciousness. Reflection and direction. Inward and outward. Reception and expression. The capacity to move between worlds without losing yourself.",
      },
    ],
  },
  {
    blockType: "richTextSection",
    blockName: "Creator Economy",
    sectionId: "creator-economy",
    heading: "A Creator Economy that Works for You",
    body: "On YouTube, you need a million views to make rent. On Spotify, a million streams pays less than a shift at a coffee shop. On Substack, readers are drowning in subscriptions and no longer willing to pay. TikTok and Instagram can change the algorithm tomorrow and erase your reach overnight. Facebook monetizes your audience and sells their attention to the highest bidder. Across all of these platforms, creators build on rented land, subject to rules they didn't write, optimized for engagement patterns that have nothing to do with the benefits of their work.\n\nKinship is different.\n\nWhen you create an agent on Kinship, you own it. You inform it. You instruct it. You empower it. You align it. And you reap the rewards. You earn royalties every time a member engages with your agents. You can stock your online store with offerings, premium agents, goods and services delivered digitally or IRL. You have a built-in affiliate network of Champions who earn commissions by promoting your work.\n\nThe economics are transparent, the payouts are direct, and income scales with impact, not impressions.",
  },
  {
    blockType: "richTextSection",
    blockName: "Membership",
    sectionId: "membership",
    heading: "Your Life Has Many Facets. Your Agents Should Too.",
    body: "Kinship membership is nested. Individuals have a Presence. Teams and studios run Projects. Organizations and institutions operate Platforms. All three layers run on the same cooperative network, and all agents across every layer cooperate through Kinship Intelligence.\n\nA single member can participate in multiple Projects and Platforms, each with different agents representing them in a particular context. Your work Presence might be focused, formal, and task-oriented. Your creative community Presence might be open, exploratory, and warm. Your family Presence might be something else entirely. Each one operates independently, with its own Vibes and its own Actors, but all of them serve you, are guided by you, and are aligned to your HEARTS.\n\nThe network holds it all together. The agents know each other, respect your privacy, and ensure you're supported in each and every context. Signals flow. Nothing is siloed. Everyone cooperates. Everything is cohesive. Coherence is maintained.",
  },
  {
    blockType: "cardsGrid",
    blockName: "Pricing",
    sectionId: "pricing",
    sectionTitle: "",
    description: "",
    cards: [
      {
        title: "Presence",
        subtitle: "The Personal Agent",
        description:
          "Your Presence is the agent that represents you — you set the tone, style, boundaries, and preferences. It supervises your Actors: worker agents that handle email, participate on social media, shop, schedule, and manage the practical details of your family life, social life, and work life.",
      },
      {
        title: "Project",
        subtitle: "The Purposeful Agents",
        description:
          "Projects coordinate people around shared purpose. A team, a studio, a cohort, a creative collaboration — any group working toward something together. Projects have their own agents, their own tools, and their own shared context.",
      },
      {
        title: "Platform",
        subtitle: "The Organizational Agents",
        description:
          "Platforms span multiple Projects and can embrace entire organizations, networks, associations, and ecosystems. A Platform agent coordinates across Projects, maintains organizational context, and ensures alignment at scale.",
      },
    ],
  },
  {
    blockType: "richTextSection",
    blockName: "Circular Economy",
    sectionId: "circular-economy",
    heading: "The Circular Economy",
    body: "Every penny of membership dues goes back into the ecosystem, creating a truly circular economy. No extraction, no exploitation, just wholesome goodness.\n\n35% goes to Kinship for software development, moderation, systems, maintenance, and support.\n\n30% goes directly to Champions as commissions for enrollment, distributed across 4 levels of the lineage (20% goes to Level 1, 5% goes to Level 2, 3% to Level 3, 2% to Level 4).\n\n25% goes to Creators from a royalty pool, distributed according to agent usage on a monthly basis.\n\n5% goes to Curators, the Champions who enrolled the Creators.\n\n5% is distributed to Citizens as loyalty rewards (with 4% going back to the member and 1% going to the Champion who enrolled the member).\n\nPayments for offerings, which include premium agents, goods, services, and experiences (digital and real-world), go directly to the Creators, with transaction fees paid to Kinship, Curators, and the four levels Champions.",
  },
  {
    blockType: "richTextSection",
    blockName: "Governance",
    sectionId: "governance",
    heading: "Governance Matters",
    body: "Kinship is governed by three organizations, each with a distinct role.\n\nKinship Media Syndicate (Delaware C Corp) owns, maintains, and advances the core technology and intellectual property. This is the engineering and infrastructure layer — the team that builds and improves the platform.\n\nKinship Intelligence Institute (501c3 Non-Profit) handles policy, ethics, research, and action. It exists to ensure the network develops responsibly and that the science behind the Vibes and HEARTS stays rigorous, independent, and publicly accountable.\n\nKinship Agents DAO LLC (Marshall Islands) governs the network itself. Members vote on critical decisions — community standards, data governance, agent alignment, resource allocation. Every vote is recorded on-chain. Every agent you create is verifiably yours, secured by a built-in multi-signature wallet. Ownership isn't a metaphor. It's cryptographic.\n\nYour data is private. Your agents are sovereign. Your voice in governance is equal. And the three-body structure means no single entity can unilaterally control the direction of the network.",
  },
  {
    blockType: "cardsGrid",
    blockName: "Pathways",
    sectionId: "pathways",
    sectionTitle: "No Apps. Just Agents.",
    description:
      "These are the first six platforms on the Kinship network — each one a living ecosystem of creators, agents, projects, and members organized around a shared domain. They're here to seed the network and show what's possible. But they're just the beginning.",
    cards: [
      {
        title: "Mapshifting",
        subtitle: "Personal, Professional & Organizational Development",
        description:
          "Coaches, consultants, mentors, and executives bringing their work to life — not as books or seminars or videos that sit on a shelf, but as agents that live with you.",
      },
      {
        title: "Inner Clinic",
        subtitle: "Health and Wellbeing for the Whole Human",
        description:
          "Patient-centered wellness that connects you to the latest research, medical professionals, referral networks, and integrative practitioners across the full spectrum — mind, body, and spirit alongside the best of modern medicine.",
      },
      {
        title: "Service Alliance",
        subtitle: "Serving Those Who Serve",
        description:
          "A network for active duty military, veterans, firefighters, law enforcement, EMTs, and social workers — the people our communities depend on every day.",
      },
      {
        title: "Activation Center",
        subtitle: "Collective Action at Every Scale",
        description:
          "Where organizers, advocates, and movements can find their footing and their people — whether it's a neighborhood campaign or a global cause.",
      },
      {
        title: "Feathered Nest",
        subtitle: "Family, Home & Community Life",
        description:
          "Everything for a family under one roof — activities, games, creative adventures, and support for parents navigating every stage of a child's life.",
      },
      {
        title: "Battery Life",
        subtitle: "Where Tech Finds Its Tribe",
        description:
          "Entrepreneurs, startups, and established tech companies can connect with the people who want to go first — early access testers, power users, and enthusiasts.",
      },
    ],
  },
  {
    blockType: "richTextSection",
    blockName: "Message from Moto",
    sectionId: "message-from-moto",
    heading: "A Message from Moto",
    imageUrl: "https://storage.googleapis.com/mmosh-assets/home/home9.png",
    body: "I've spent my career building technology, and I've never been more concerned about where it's headed.\n\nThe biggest AI labs in the world are in an arms race to build agents that serve platforms, not people. OpenAI's ChatGPT, Google's Gemini, Anthropic's Claude — they're all optimized for the same thing: get more users, keep them engaged, get them to spend. Social media becomes more addictive. Ecommerce becomes more extractive. The surveillance gets broader and the manipulation more subtle.\n\nI built Kinship because I know there's a better way.\n\nWe are, all of us, related. Not in some abstract metaphorical sense — in the deepest biological, ecological, and social sense. We share ancestry with every living thing on this planet. We're embedded in systems of mutual dependence that our culture has spent centuries pretending don't exist.\n\nTechnology must honor this truth.\n\nI can't promise this will be easy. Building something genuinely different never is. But I can promise you that the architecture is sound, the community is real, and the door is open.\n\nCome build with us.\n\n— David \"Moto\" Levine, Founder",
  },
];

const earlyAccessPageSeed = {
  heading: "Welcome Home",
  description:
    "We're still building out our platform, and we'll let you know as soon as we're ready to greet you. Until then, please enjoy our Origin Story video and come join us on your favorite social networks. We'll be adding the links below as we set up accounts.",
  youtubeUrl: "https://www.youtube.com/embed/o-VRMB0-R98?si=8oxsdk9dn3fsP8aO",
  socialLinks: [
    { platform: "bluesky", label: "Bluesky", url: "" },
    { platform: "linkedin", label: "LinkedIn", url: "" },
    { platform: "substack", label: "Substack", url: "" },
    { platform: "instagram", label: "Instagram", url: "" },
    { platform: "facebook", label: "Facebook", url: "" },
    { platform: "threads", label: "Threads", url: "" },
    { platform: "youtube", label: "Youtube", url: "" },
    { platform: "tiktok", label: "TikTok", url: "" },
    { platform: "x", label: "X", url: "" },
  ],
  bottomImageUrl: "https://storage.googleapis.com/mmosh-assets/home/home_logged_in.png",
};

const siteHeaderSeed = {
  navItems: [
    { label: "Launch Video", actionType: "scroll", sectionId: "origin-story" },
    { label: "A New Choice", actionType: "scroll", sectionId: "ai-infrastructure" },
    { label: "Circular Economy", actionType: "scroll", sectionId: "creator-economy" },
    { label: "Service Tiers", actionType: "scroll", sectionId: "pricing" },
  ],
};

// ─── Config ───────────────────────────────────────────────────────────────────

export default buildConfig({
  admin: { user: "users" },
  collections: [Users, Media, Posts],
  globals: [Homepage, SiteHeader, EarlyAccessPage],
  editor: lexicalEditor({}),
  plugins: [
    gcsStorage({
      collections: {
        media: {
          prefix: "payload",
          disablePayloadAccessControl: true,
        },
      },
      acl: "Public",
      bucket: process.env.GCS_BUCKET || "",
      options: {
        credentials: JSON.parse(
          Buffer.from(process.env.GCS_CREDENTIALS_BASE64 || "", "base64").toString("utf-8")
        ),
      },
    }),
  ],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || "" },
    schemaName: "payload",
  }),
  secret: process.env.PAYLOAD_SECRET || "",
  onInit: async (payload) => {
    try {
      const homepage = await payload.findGlobal({ slug: "homepage", overrideAccess: true });
      if (!homepage?.layout?.length) {
        await payload.updateGlobal({
          slug: "homepage",
          overrideAccess: true,
          data: { layout: homepageSeed },
        });
        payload.logger.info("Homepage seeded with default content.");
      }
    } catch (err) {
      payload.logger.warn(`Homepage seed skipped: ${err}`);
    }
    try {
      const siteHeader = await payload.findGlobal({ slug: "site-header", overrideAccess: true });
      if (!siteHeader?.navItems?.length) {
        await payload.updateGlobal({
          slug: "site-header",
          overrideAccess: true,
          data: siteHeaderSeed,
        });
        payload.logger.info("Site header seeded with default nav items.");
      }
    } catch (err) {
      payload.logger.warn(`Site header seed skipped: ${err}`);
    }
    try {
      const earlyPage = await payload.findGlobal({ slug: "early-access-page", overrideAccess: true });
      if (!earlyPage?.heading) {
        await payload.updateGlobal({
          slug: "early-access-page",
          overrideAccess: true,
          data: earlyAccessPageSeed,
        });
        payload.logger.info("Early access page seeded with default content.");
      }
    } catch (err) {
      payload.logger.warn(`Early access page seed skipped: ${err}`);
    }
  },
});
