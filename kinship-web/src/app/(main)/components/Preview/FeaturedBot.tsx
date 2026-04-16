import Image from "next/image";

type Props = {
  onActivate: () => void;
};

const FeaturedBot = ({ onActivate }: Props) => {
  return (
    <div className="flex md:flex-row flex-col px-2 items-center rounded-2xl border-[#FFFFFF80] bg-[rgba(255,255,255,0.02)] mt-[30px] border-[1px] py-8 px-4">
      <div className="flex justify-center items-center w-[300px] h-[200px] md:h-[300px] md:w-[600px]">
        <video
          className="w-full h-[200px] md:h-[300px] w-[300px] md:w-[600px] rounded-lg"
          muted
          controls
          loop={false}
          playsInline
        >
          <source
            src="https://storage.googleapis.com/mmosh-assets/home/home.mp4"
            type="video/mp4"
          />
          Your browser does not support the video tag.
        </video>
      </div>

      <div className="flex flex-col items-start ml-8">
        <div className="flex items-center">
          <Image
            width={60}
            height={60}
            src="https://storage.googleapis.com/mmosh-assets/fdn_landing_placeholder.png"
            alt="image"
          />

          <div className="mx-4" />

          <div className="flex flex-col">
            <p className="underline text-[#FFFFFF] text-lg">
              Full Disclosure Bot
            </p>

            <div className="my-1" />

            <p className="text-[#FF00AE] text-base">
              By{" "}
              <span className="underline text-[#FF00AE]">Kinship Systems</span>
            </p>
          </div>
        </div>

        <div className="my-2" />

        <p className="text-2xl font-bold text-[#FFFFFF]">Where AI Belongs</p>

        <div className="my-2" />

        <p className="text-base text-white">
          You may feel powerless. Everywhere you turn Big Tech is enforcing
          conformity, controlling behavior, endlessly distracting, exploiting,
          and extracting as much value as possible.
        </p>

        <div className="my-2" />

        <div className="w-full flex justify-left">
          <div className="flex items-center rounded-full border-[1px] border-[#FF00AE] md:py-2 px-4 bg-[#FFFFFF05]">
            <p className="text-white text-sm">43</p>
            <div className="mx-2" />
            <p className="text-sm">Subscribers</p>
          </div>

          <div className="mx-4" />

          <div className="flex items-center rounded-full border-[1px] border-[#FF00AE] md:py-2 px-4 bg-[#FFFFFF05]">
            <p className="text-white text-sm">1050 USDC</p>
            <div className="mx-2" />
            <p className="text-sm">Royalties</p>
          </div>
        </div>

        <button
          className="flex justify-center items-center px-8 py-2 mt-5 justify-center items-center rounded-[8px] bg-[#FF00AE]"
          onClick={onActivate}
        >
          <p className="text-base text-white">Activate</p>
        </button>
      </div>
    </div>
  );
};

export default FeaturedBot;
