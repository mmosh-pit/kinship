import MessageBanner from "@/app/(main)/components/common/MessageBanner";

interface ErrorContainerVWProps {
  showMessage: boolean;
  className: string;
  messageText: string;
}

export const ErrorContainerVW = (props: ErrorContainerVWProps) => {
  const { showMessage, className, messageText } = props;
  if (showMessage) {
    return (
      <div className="w-full absolute top-0 left-1/2 -translate-x-1/2">
        <MessageBanner type={className} message={messageText} />
      </div>
    );
  }
};
