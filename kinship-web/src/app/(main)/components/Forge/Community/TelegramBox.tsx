import EditIcon from "@/assets/icons/EditIcon";
import axios from "axios";
import React from "react";
import Button from "../../common/Button";

type Props = {
  telegram: string;
  communityName: string;
  isOwner: boolean;
};

const TelegramBox = ({ telegram, communityName, isOwner }: Props) => {
  const [isLoading, setIsLoading] = React.useState(false);
  const [telegramData, setTelegramData] = React.useState(telegram);
  const [isEditMode, setIsEditMode] = React.useState(false);

  const updateCommunity = async () => {
    setIsLoading(true);
    await axios.patch("/api/update-community-info", {
      data: {
        telegram: telegramData,
      },
    });
    setIsEditMode(false);
    setIsLoading(false);
  };

  return (
    <div className="community-page-container-card py-4 px-6 rounded-xl max-w-[85%] md:max-w-[70%] lg:max-w-[60%]">
      <h6 className="text-center">Official Community on Telegram</h6>
      <p className="text-white text-xs my-4 text-center">{`With the ${communityName} Pass, you may join the Official Community on Telegram by following the link below`}</p>

      {!isOwner ? (
        <a
          className="text-underline text-[#E5029D] mt-2 text-center"
          href={telegram}
        >
          {telegramData}
        </a>
      ) : (
        <div className="w-full flex items-center self-center justify-evenly">
          <div className="relative border-[1px] border-[#FFF] border-opacity-30 rounded-xl">
            <input
              value={telegramData}
              onChange={(e) => {
                if (!isEditMode) return;

                setTelegramData(e.target.value);
              }}
              className="input h-[1vmax] max-w-[100%] text-center text-xs bg-black bg-opacity-[0.07] text-[#E5029D] placeholder-white placeholder-opacity-[0.3]"
            />

            {!isEditMode && (
              <div
                className="flex justify-center items-center rounded-full bg-[#424084] bg-opacity-[0.26] w-[1vmax] h-[1vmax] cursor-pointer absolute top-[-5px] right-[-5px]"
                onClick={() => setIsEditMode(true)}
              >
                <EditIcon />
              </div>
            )}
          </div>
          {isEditMode && (
            <div className="max-w-[50%]">
              <Button
                isPrimary={false}
                action={updateCommunity}
                title="Save"
                size="small"
                disabled={!isEditMode}
                isLoading={isLoading}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TelegramBox;
