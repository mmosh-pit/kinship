import Image from "next/image";

type Props = {
  image: string;
  name: string;
  username: string;
  description: string;
  coinImage?: string;
};

const CommunityCard = ({ image, name, description, coinImage }: Props) => {
  return (
    <div className="w-[350px] h-[350px] flex flex-col items-center justify-center">
      <div className="w-[350px] h-[350px] my-2 home-community-card-image">
        <Image
          src={image}
          alt="community-image"
          layout="fill"
          className="rounded-lg"
        />

        {coinImage && (
          <img
            src={coinImage}
            alt="Coin"
            className="absolute left-[45%] top-[-15px] w-[1.5vmax] h-[1.5vmax] rounded-full"
          />
        )}
      </div>

      <div className="w-full flex flex-col bg-[#080039A8] border-b-xl p-2">
        <p className="text-sm text-white">{name}</p>
        <p className="text-xs">{description}</p>
      </div>
    </div>
  );
};

export default CommunityCard;
