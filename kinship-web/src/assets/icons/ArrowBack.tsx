type Props = React.SVGProps<SVGSVGElement>;

const ArrowBack = (props: Props) => (
  <svg
    width="1vmax"
    height="1vmax"
    viewBox="0 0 10 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M8.375 1.25L1.625 8L8.375 14.75"
      stroke="white"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default ArrowBack;
