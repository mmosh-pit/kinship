interface BackArrowVWProps {
  onClick: () => void;
}

export const BackArrowVW = (props: BackArrowVWProps) => {
  const { onClick } = props;
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 left-0 cursor-pointer"
      onClick={onClick}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 12L4 12M4 12L10 6M4 12L10 18"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
