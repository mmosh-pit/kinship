import Image from "next/image";
import Button from "../../common/Button";
import { useRouter } from "next/navigation";

const InvitationCard = () => {
  const navigate = useRouter();

  const navigateToInvitation = () => {
    navigate.push("/create/create_invitation");
  };

  return (
    <div className="flex">
      <div className="relative w-[12vmax] h-[8vmax] ml-2 mr-4">
        <Image
          src="https://storage.googleapis.com/mmosh-assets/invitation.png"
          alt="Invitation"
          layout="fill"
        />
      </div>

      <div className="w-full flex flex-col justify-between">
        <div className="w-full flex flex-col mt-2 mb-4">
          <p className="text-lg text-white">Invite your Friends to the DAO</p>
          <p className="text-sm mt-2">
            Build up your guild and earn royalties when new members join MMOSH
            DAO.
          </p>
        </div>

        <div className="flex flex-col self-center">
          <Button
            isLoading={false}
            title="Mint Invitations"
            isPrimary
            size="small"
            action={navigateToInvitation}
          />
        </div>
      </div>
    </div>
  );
};

export default InvitationCard;
