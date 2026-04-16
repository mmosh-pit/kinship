import Image from "next/image";
import { useRouter } from "next/navigation";
import Button from "../../common/Button";

const ProfileCard = () => {
  const navigate = useRouter();

  const navigateToInvitation = () => {
    navigate.push("/create/create_profile");
  };

  return (
    <div className="flex">
      <div className="relative w-[12vmax] h-[8vmax] ml-2 mr-4">
        <Image
          src="https://storage.googleapis.com/mmosh-assets/profile_placeholder.png"
          alt="Invitation"
          layout="fill"
        />
      </div>

      <div className="w-full flex flex-col justify-between">
        <div className="w-full flex flex-col mt-2 mb-4">
          <p className="text-lg text-white">
            Create your Profile to join the DAO
          </p>
          <p className="text-sm mt-2">
            MMOSH DAO members can create their own coins, build community and
            help allocate resources to support the growth and expansion of our
            ecosystem.
          </p>
        </div>

        <div className="flex flex-col self-center">
          <Button
            isLoading={false}
            title="Create your Profile"
            isPrimary
            size="small"
            action={navigateToInvitation}
          />
        </div>
      </div>
    </div>
  );
};

export default ProfileCard;
