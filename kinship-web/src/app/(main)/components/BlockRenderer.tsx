"use client";

import React from "react";
import { HeroBlock } from "./blocks/HeroBlock";
import { VideoSectionBlock } from "./blocks/VideoSectionBlock";
import { RichTextSectionBlock } from "./blocks/RichTextSectionBlock";
import { CardsGridBlock } from "./blocks/CardsGridBlock";

type BlockProps = {
  block: Record<string, any>;
  onScrollToEarlyAccess: () => void;
};

const blockComponents: Record<string, React.ComponentType<BlockProps>> = {
  hero: HeroBlock,
  videoSection: VideoSectionBlock,
  richTextSection: RichTextSectionBlock,
  cardsGrid: CardsGridBlock,
};

export function BlockRenderer({ block, onScrollToEarlyAccess }: BlockProps) {
  const Component = blockComponents[block.blockType];
  if (!Component) return null;
  return <Component block={block} onScrollToEarlyAccess={onScrollToEarlyAccess} />;
}
