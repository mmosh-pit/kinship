"use client";

type Props = {
  block: Record<string, any>;
  onScrollToEarlyAccess: () => void;
};

export function RichTextSectionBlock({ block, onScrollToEarlyAccess }: Props) {
  const paragraphs = (block.body || "")
    .split("\n\n")
    .map((p: string) => p.trim())
    .filter(Boolean);

  const imageUrl =
    (typeof block.image === "object" ? block.image?.url : block.image) ||
    block.imageUrl ||
    null;

  const sectionId =
    block.sectionId ||
    (block.blockName ? block.blockName.toLowerCase().replace(/\s+/g, "-") : undefined);

  // Image + text layout (e.g. "Message from Moto")
  if (imageUrl) {
    return (
      <section
        id={sectionId}
        className="max-md:pt-7 max-md:pb-0 pb-16 max-w-[1144px] mx-auto px-4 md:px-8 scroll-mt-[120px]"
      >
        {block.heading && (
          <h3 className="transition duration-300 place-self-center sm:text-left md:text-[3.125rem] max-md:text-xl max-md:leading-relaxed sm:text-[52px] font-goudy font-bold leading-[3.75rem] tracking-[-1.04px] bg-[linear-gradient(143deg,#FFF_18.17%,rgba(255,255,255,0)_152.61%)] bg-clip-text text-transparent stroke-text">
            {block.heading}
          </h3>
        )}
        <div className="xl:flex items-start mt-5">
          <div
            className="w-full h-[350px] xl:w-[433px] xl:h-[430px] shrink-0 rounded-[30px] bg-center bg-cover bg-no-repeat xl:mr-4"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          <div className="flex flex-col px-4 xl:w-[695px] gap-4 mt-4 xl:mt-0">
            {paragraphs.map((para: string, i: number) => (
              <p
                key={i}
                className="text-justify font-avenir text-base sm:text-[1.063rem] max-md:leading-relaxed font-normal leading-[100%] tracking-[-0.02em] text-[rgba(255,255,255,0.78)]"
              >
                {para}
              </p>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Standard heading + body layout
  return (
    <div
      id={sectionId}
      className="mt-[3rem] max-md:mt-8 px-4 md:px-8 scroll-mt-[120px]"
    >
      {block.heading && (
        <h1 className="text-center font-bold xl:px-12 leading-[1.2] xl:w-[65.063rem] text-[3.75rem] max-xl:text-5xl max-md:text-4xl max-sm:text-2xl max-md:leading-relaxed m-auto font-goudy bg-[linear-gradient(to_bottom,#FFFFFF,#FFFFFF64)] bg-clip-text text-transparent stroke-text">
          {block.heading}
        </h1>
      )}

      {block.subheading && (
        <p className="max-sm:text-xl text-3xl leading-[110%] tracking-[-0.02em] font-bold text-center text-[#FFFFFFC7] font-avenirNext mt-2 mb-5">
          {block.subheading}
        </p>
      )}

      {paragraphs.length > 0 && (
        <div className="my-5 xl:w-[64.313rem] m-auto">
          {paragraphs.map((para: string, i: number) => (
            <p
              key={i}
              className="font-avenir max-md:text-sm max-md:px-2 max-md:mt-4 text-[1.188rem] leading-[110%] font-normal text-center text-[#FFFFFFC7] xl:px-[2rem] m-auto mb-4"
            >
              {para}
            </p>
          ))}
        </div>
      )}

      {block.showCtaButton && (
        <div className="text-center mt-6">
          <button
            className="btn bg-[#EB8000] font-avenirNext py-[1.063rem] ps-[1.875rem] pe-[1.813rem] text-lg font-extrabold leading-[100%] text-white border-none hover:bg-[#EB8000]"
            onClick={onScrollToEarlyAccess}
          >
            {block.ctaText || "Join Early Access"}
          </button>
        </div>
      )}
    </div>
  );
}
