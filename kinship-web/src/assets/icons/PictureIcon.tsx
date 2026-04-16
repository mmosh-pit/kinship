type Props = React.SVGProps<SVGSVGElement>;

const PictureIcon = (props: Props) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 13 13"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M12.125 10.875V2.125C12.125 1.4375 11.5625 0.875 10.875 0.875H2.125C1.4375 0.875 0.875 1.4375 0.875 2.125V10.875C0.875 11.5625 1.4375 12.125 2.125 12.125H10.875C11.5625 12.125 12.125 11.5625 12.125 10.875ZM4.3125 7.4375L5.875 9.31875L8.0625 6.5L10.875 10.25H2.125L4.3125 7.4375Z"
      fill="white"
    />
  </svg>
);

export default PictureIcon;
