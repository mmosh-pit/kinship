"use client";

type Props = {
  block: Record<string, any>;
  onScrollToEarlyAccess: () => void;
};

export function HeroBlock({ block, onScrollToEarlyAccess }: Props) {
  const bgImage =
    (typeof block.backgroundImage === "object" ? block.backgroundImage?.url : block.backgroundImage) ||
    "/background/RetreatCenterhero.jpg";

  const sectionId =
    block.sectionId ||
    (block.blockName ? block.blockName.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div
      id={sectionId}
      className="text-center relative min-h-screen flex justify-center items-center bg-cover bg-center bg-no-repeat py-[6.875rem] scroll-mt-[120px]"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      <div className="m-auto max-w-[85%] xl:w-[50.063rem] border-[0.031rem] border-[#FFFFFF] bg-[#3F3E3E54] md:backdrop-filter backdrop-blur-[30px] rounded-[3rem] xl:p-[20px] p-[10px]">
        <h1 className="w-auto md:text-[2.813rem] text-4xl leading-relaxed xl:leading-[2.813rem] font-bold font-poppinsNew bg-[linear-gradient(135deg,#FFF_11.53%,rgba(255,255,255,0.30)_109.53%)] bg-clip-text text-transparent stroke-text">
          {block.title}
        </h1>

        {block.subtitle && (
          <div className="mt-3.5">
            <p className="xl:text-base text-xs text-[#FFFFFF] font-avenir text-opacity-90 xl:px-12">
              {block.subtitle}
            </p>
          </div>
        )}

        {block.tagline && (
          <h1 className="w-auto xl:text-[1.375rem] text-[0.75rem] leading-[1.2] font-bold font-poppinsNew bg-[linear-gradient(135deg,#FFF_11.53%,rgba(255,255,255,0.30)_109.53%)] bg-clip-text text-transparent stroke-text mt-4">
            {block.tagline}
          </h1>
        )}

        <div className="w-full mt-6">
          <button
            className="btn bg-[#EB8000] text-white border-none hover:bg-[#EB8000] w-[12rem]"
            onClick={onScrollToEarlyAccess}
          >
            {block.ctaText || "Join Early Access"}
          </button>
        </div>
      </div>

      <div className="absolute bottom-0 w-full h-[8.25rem] bg-[linear-gradient(180deg,rgba(3,1,27,0)_0%,#03011B_100%)]" />
    </div>
  );
}
