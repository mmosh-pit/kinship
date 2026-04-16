import Image from "next/image";
import React from "react";

type Props = {
  image: string;
  name: string;
  username: string;
  description: string;
  coinImage?: string;
};

const Card = ({ image, name, description, username, coinImage }: Props) => (
  <div className="community-card">
    <div className="flex w-full justify-center items-center">
      <p className="text-lg text-white text-center">{name}</p>
    </div>

    <div className="relative w-[12vmax] h-[12vmax] md:w-[15vmax] md:h-[15vmax] my-2">
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
          className="absolute left-[37%] md:left-[45%] bottom-[-15px] w-[1.5vmax] h-[1.5vmax] rounded-full"
        />
      )}
    </div>

    <div className="w-full flex flex-col">
      <p className="text-sm">{username}</p>
      <p className="text-xs">{description}</p>
    </div>
  </div>
);

export default Card;
