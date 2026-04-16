import CloseIcon from "@/assets/icons/CloseIcon";
import MicIcon from "@/assets/icons/MicIcon";

const AudioInteraction = ({
  isSpeaking,
  stopSession,
  isLoading,
}: {
  isSpeaking: boolean;
  stopSession: () => void;
  isLoading: boolean;
}) => {
  return (
    <div className="w-[90%] h-[38rem] flex flex-col items-center justify-between mx-14 my-5 bg-[#181747] backdrop-filter backdrop-blur-[6px] px-8 py-16 rounded-xl ">
      {isLoading ? (
        <div className="w-full h-full flex justify-center items-center">
          <span className="loading loading-spinner loading-md w-[5vmax] h-[5vmax] bg-[#7B30DB]"></span>
        </div>
      ) : (
        <>
          <div className="h-[10px]" />

          <div className="flex flex-col justify-center items-center">
            <div
              className={`mic-container ${isSpeaking ? "active" : "inactive"}`}
            >
              {isSpeaking && (
                <div className="mic-colors-wrapper">
                  <div className="mic-container-1" />
                  <div className="mic-container-2" />
                  <div className="mic-container-3" />
                </div>
              )}

              <div
                className={`voice-inner-mic rounded-full ${isSpeaking && "animated"}`}
              >
                <MicIcon />
              </div>
            </div>

            {!isSpeaking && !isLoading && (
              <p className="text-xl text-white mt-8">I'm Listening</p>
            )}

            {isLoading && (
              <p className="text-xl text-white mt-8">Connecting...</p>
            )}
          </div>
          <button
            className={`relative border-[#FFFFFF47] border-[1px] bg-[#FFFFFF0F] p-4 rounded-full mt-8`}
            onClick={stopSession}
          >
            <CloseIcon width="0.8vmax" height="0.8vmax" />
          </button>
        </>
      )}
    </div>
  );
};

export default AudioInteraction;
