import type { CollectionConfig } from "payload";

const Media: CollectionConfig = {
  slug: "media",
  upload: true,
  admin: {
    useAsTitle: "filename",
  },
  fields: [
    {
      name: "alt",
      type: "text",
      label: "Alt Text",
    },
  ],
};

export default Media;
