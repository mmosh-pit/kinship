import CloseIcon from "@/assets/icons/CloseIcon";
import WarningIcon from "@/assets/icons/WarningIcon";
import Modal from "react-modal";

type Props = {
  onAccept: () => void;
  onDeny: () => void;
  title?: string;
  message: string;
  isOpen: boolean;
};

const customStyles = {
  content: {
    top: "50%",
    left: "50%",
    right: "auto",
    bottom: "auto",
    marginRight: "-50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "#181747",
    minWidth: "300px",
    maxWidth: "500px",
    width: "100%",
    borderRadius: "1rem",
    border: "none",
    padding: "2rem 3rem",
  },
  overlay: {
    background: "#00000040",
  },
};

const WarningModal = ({ onAccept, onDeny, title, message, isOpen }: Props) => {
  return (
    <Modal isOpen={isOpen} onRequestClose={onDeny} style={customStyles}>
      <div className="flex flex-col justify-center items-center">
        <div className="w-full flex justify-end">
          <button onClick={onDeny}>
            <CloseIcon width={20} height={20} />
          </button>
        </div>

        <div className="my-2">
          <WarningIcon />
        </div>

        <div className="my-2">
          <h3>{title ?? "Warning"}</h3>
        </div>

        <div className="my-4">
          <p className="text-white text-base text-center">{message}</p>
        </div>

        <div className="w-full flex justify-around mt-6">
          <button
            className="rounded-full py-2 w-full bg-[#080636]"
            onClick={onDeny}
          >
            <p className="text-white text-base font-bold">Cancel</p>
          </button>

          <div className="mx-4" />

          <button
            className="rounded-full py-2 w-full bg-[#FF00AE]"
            onClick={onAccept}
          >
            <p className="text-white text-base font-bold">Continue</p>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default WarningModal;
