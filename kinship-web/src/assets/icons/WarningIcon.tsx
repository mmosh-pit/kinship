type Props = React.SVGProps<SVGSVGElement>;

const WarningIcon = (props: Props) => (
  <svg
    width="46"
    height="46"
    viewBox="0 0 46 46"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M22.8333 31.1667H22.85M22.8333 14.5V24.9167M43.6667 22.8333C43.6667 11.3271 34.3396 2 22.8333 2C11.3271 2 2 11.3271 2 22.8333C2 34.3396 11.3271 43.6667 22.8333 43.6667C34.3396 43.6667 43.6667 34.3396 43.6667 22.8333Z"
      stroke="white"
      strokeWidth="3"
      strokeMiterlimit="10"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default WarningIcon;
