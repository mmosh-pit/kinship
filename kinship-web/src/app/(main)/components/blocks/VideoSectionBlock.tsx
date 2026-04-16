"use client";

type Props = { block: Record<string, any> };

export function VideoSectionBlock({ block }: Props) {
  const sectionId =
    block.sectionId ||
    (block.blockName ? block.blockName.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <section
      id={sectionId}
      className="mb-8 md:mt-12 mt-8 flex flex-col w-full h-full px-4 md:px-8 pt-4 pb-2 justify-center items-center scroll-mt-[120px]"
    >
      {block.title && (
        <h1 className="text-center font-bold xl:px-5 leading-[1] xl:w-[65.063rem] text-[3.75rem] max-xl:text-5xl max-md:text-4xl max-sm:text-2xl m-auto font-goudy">
          {block.title}
        </h1>
      )}

      {block.youtubeUrl && (
        <div className="my-5 relative w-full">
          <iframe
            className="w-[100%] xl:h-[35rem] h-64 rounded-lg"
            src={block.youtubeUrl}
            title={block.title || "Video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
          <div className="pointer-events-none absolute bottom-0 w-full h-[5.75rem] bg-[linear-gradient(180deg,rgba(3,1,27,0)_0%,#03011B_100%)]" />
          <div className="pointer-events-none absolute top-0 right-0 w-[4.25rem] h-full bg-[linear-gradient(90deg,rgba(3,1,27,0)_0%,#03011B_100%)]" />
          <div className="pointer-events-none absolute top-0 left-0 w-[4.25rem] h-full bg-[linear-gradient(-90deg,rgba(3,1,27,0)_0%,#03011B_100%)]" />
        </div>
      )}

      {block.description && (
        <div className="xl:w-[64.313rem] m-auto">
          <p className="max-md:text-sm max-md:px-2 text-center text-lg text-[#FFFFFFC7] px-[2rem] mt-5 font-avenir">
            {block.description}
          </p>
        </div>
      )}
    </section>
  );
}
