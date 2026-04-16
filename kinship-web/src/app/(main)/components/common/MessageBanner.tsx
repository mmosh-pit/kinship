type Props = {
  message: string;
  type: string;
};

const MessageBanner = ({ message, type }: Props) => {
  const getBackgroundColor = () => {
    if (type === "warn") {
      return "warn-container";
    }

    if (type === "info") {
      return "info-container";
    }

    if (type === "error") {
      return "error-container";
    }

    return "success-container";
  };

  if (!message) return <></>;

  return (
    <div
      className={`w-full flex justify-center items-center ${getBackgroundColor()} p-4`}
    >
      <p className="text-base text-white text-center">{message}</p>
    </div>
  );
};

export default MessageBanner;
