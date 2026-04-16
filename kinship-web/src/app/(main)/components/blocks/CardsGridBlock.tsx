"use client";

type Card = { title?: string; subtitle?: string; description?: string };

type Props = {
  block: Record<string, any>;
  onScrollToEarlyAccess: () => void;
};

export function CardsGridBlock({ block, onScrollToEarlyAccess }: Props) {
  const cards: Card[] = block.cards || [];
  const sectionId =
    block.sectionId ||
    (block.blockName ? block.blockName.toLowerCase().replace(/\s+/g, "-") : undefined);

  const colsClass =
    cards.length >= 4
      ? "grid-cols-4 max-xl:grid-cols-2 max-md:grid-cols-1"
      : "grid-cols-3 max-xl:grid-cols-2 max-md:grid-cols-1";

  return (
    <div
      id={sectionId}
      className="px-4 md:px-8 mt-[3rem] max-md:mt-8 scroll-mt-[120px]"
    >
      {block.sectionTitle && (
        <h1 className="text-center font-bold xl:px-10 leading-tight xl:w-[65.063rem] text-[3.75rem] max-xl:text-5xl max-md:text-4xl max-sm:text-2xl m-auto font-goudy bg-[linear-gradient(to_bottom,#FFFFFF,#FFFFFF64)] bg-clip-text text-transparent stroke-text">
          {block.sectionTitle}
        </h1>
      )}

      {block.description && (
        <p className="max-md:text-sm font-avenir text-center text-[#FFFFFFC7] mt-[1rem] xl:w-[64.313rem] mx-auto">
          {block.description}
        </p>
      )}

      <div
        className={`container mx-auto grid ${colsClass} gap-5 px-3 max-xl:mt-5 xl:mt-10 mb-4 xl:max-w-[79.5rem]`}
      >
        {cards.map((card, i) => (
          <div
            key={i}
            className="bg-[linear-gradient(155deg,#9091a6_11.53%,rgba(255,255,255,0.30)_109.53%)] p-[1px] rounded-xl"
          >
            <div className="bg-[linear-gradient(155deg,#070a38_0%,#07052e_109.53%)] rounded-xl py-6 px-3 h-full flex flex-col text-center">
              {card.title && (
                <p className="text-white font-bold text-[1.375rem] font-avenirNext">
                  {card.title}
                </p>
              )}
              {card.subtitle && (
                <p className="text-white font-bold text-lg font-avenirNext mt-1">
                  {card.subtitle}
                </p>
              )}
              {card.description && (
                <p className="text-[#CDCDCDE5] font-avenir text-[0.938rem] leading-[110%] tracking-[-0.02em] mt-2">
                  {card.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {block.showCtaButton && (
        <div className="w-[15rem] m-auto mt-10">
          <button
            className="btn bg-[#EB8000] text-white border-none hover:bg-[#EB8000] w-full"
            onClick={onScrollToEarlyAccess}
          >
            {block.ctaText || "Join Early Access"}
          </button>
        </div>
      )}
    </div>
  );
}
