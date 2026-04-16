type Props = React.SVGProps<SVGSVGElement>;

const UnderlineIcon = (props: Props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M3 1V6C3 7.32608 3.52678 8.59785 4.46447 9.53553C5.40215 10.4732 6.67392 11 8 11C9.32608 11 10.5979 10.4732 11.5355 9.53553C12.4732 8.59785 13 7.32608 13 6V1M1 15H15"
      stroke="white"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export default UnderlineIcon;
