import type { Block } from "payload";

export const HeroBlock: Block = {
  slug: "hero",
  labels: { singular: "Hero", plural: "Heroes" },
  fields: [
    {
      name: "backgroundImage",
      type: "upload",
      relationTo: "media",
      label: "Background Image",
    },
    { name: "title", type: "text", label: "Main Title" },
    { name: "subtitle", type: "textarea", label: "Subtitle / Description" },
    { name: "tagline", type: "text", label: "Tagline" },
    { name: "ctaText", type: "text", label: "CTA Button Text" },
  ],
};
