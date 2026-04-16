type Props = {
  title: string;
  action: () => void;
  isPrimary: boolean;
  isLoading: boolean;
  color?: string;
  size: "small" | "large";
  type?: "button" | "submit";
  disabled?: boolean;
};

const Button = ({
  isLoading,
  action,
  title,
  isPrimary,
  size,
  disabled,
  type = "button",
  color,
}: Props) => (
  <button
    className={`${isPrimary ? color || "bg-[#EB8000]" : "bg-transparent border-[1px] border-[#FFFFFF80]"} ${size === "small" ? "py-2 px-4" : "w-full py-4 px-8"} rounded-md flex items-center justify-center text-center ${disabled && "opacity-70"}`}
    type={type}
    onClick={action}
    disabled={disabled}
  >
    {isLoading ? (
      <span className="loading loading-spinner loading-lg bg-[#BEEF00]"></span>
    ) : (
      <p
        className={`text-white ${size === "small" ? "text-sm" : "text-base"} text-center`}
      >
        {title}
      </p>
    )}
  </button>
);

export default Button;
