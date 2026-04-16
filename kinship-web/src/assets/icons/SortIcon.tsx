type Props = React.SVGProps<SVGSVGElement>;

const SortIcon = (props: Props) => (
  <svg
    width="21"
    height="21"
    viewBox="0 0 21 21"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M2.625 7.875L6.125 4.375M6.125 4.375L9.625 7.875M6.125 4.375V4.625M18.375 13.125L14.875 16.625M14.875 16.625L11.375 13.125M14.875 16.625V16.375"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default SortIcon;
