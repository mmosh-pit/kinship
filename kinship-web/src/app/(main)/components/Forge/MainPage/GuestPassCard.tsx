import { useRouter } from "next/navigation";
import Image from "next/image";
import Button from "../../common/Button";

const GuestPassCard = () => {
  const navigate = useRouter();

  const navigateToCoin = () => {
    navigate.push("/coins");
  };

  return (
    <div className="flex">
      <div className="relative w-[12vmax] h-[8vmax] ml-2 mr-4">
        <Image
          src="https://storage.googleapis.com/mmosh-assets/lion.png"
          alt="Invitation"
          layout="fill"
        />
      </div>

      <div className="w-full flex flex-col justify-between">
        <div className="w-full flex flex-col mt-2 mb-4">
          <p className="text-lg text-white">
            Get a free Guess Pass from this Community
          </p>
        </div>

        <div className="flex flex-col self-center">
          <Button
            isLoading={false}
            title="Mint a Guess Pass"
            isPrimary
            size="small"
            action={navigateToCoin}
          />
        </div>
      </div>
    </div>
  );
};

export default GuestPassCard;
