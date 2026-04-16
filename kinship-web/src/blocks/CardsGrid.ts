import type { Block } from "payload";

export const CardsGridBlock: Block = {
  slug: "cardsGrid",
  labels: { singular: "Cards Grid", plural: "Cards Grids" },
  fields: [
    {
      name: "sectionTitle",
      type: "text",
      label: "Section Title",
    },
    {
      name: "description",
      type: "textarea",
      label: "Section Description",
    },
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
