type Props = React.SVGProps<SVGSVGElement>;

const DeleteIcon = (props: Props) => (
  <svg
    width="0.5vmax"
    height="0.5vmax"
    viewBox="0 0 6 6"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M5 1L1 5M1 1L5 5"
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default DeleteIcon;
