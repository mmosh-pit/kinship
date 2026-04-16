import type { Block } from "payload";

export const RichTextSectionBlock: Block = {
  slug: "richTextSection",
  labels: { singular: "Rich Text Section", plural: "Rich Text Sections" },
  fields: [
    { name: "heading", type: "text", label: "Heading" },
    { name: "subheading", type: "text", label: "Subheading" },
    {
      name: "body",
      type: "textarea",
      label: "Body Text",
      admin: { rows: 10 },
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      label: "Image (optional)",
    },
    {
      name: "imageUrl",
      type: "text",
      label: "Image URL (alternative to upload)",
    },
  ],
};
