import type { Block } from "payload";

export const VideoSectionBlock: Block = {
  slug: "videoSection",
  labels: { singular: "Video Section", plural: "Video Sections" },
  fields: [
    { name: "title", type: "text", label: "Section Title" },
    { name: "youtubeUrl", type: "text", label: "YouTube Embed URL" },
    { name: "description", type: "textarea", label: "Description" },
  ],
};
