type Props = React.SVGProps<SVGSVGElement>;

const TelegramMagentaIcon = (props: Props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.width ?? "24"}
    height={props.height ?? "24"}
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <g clipPath="url(#clip0_6638_14036)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.7747 4.42997C20.0218 4.32596 20.2923 4.29008 20.558 4.32608C20.8237 4.36208 21.0749 4.46863 21.2854 4.63465C21.4959 4.80067 21.6581 5.02008 21.7551 5.27005C21.852 5.52002 21.8802 5.79141 21.8367 6.05597L19.5687 19.813C19.3487 21.14 17.8927 21.901 16.6757 21.24C15.6577 20.687 14.1457 19.835 12.7857 18.946C12.1057 18.501 10.0227 17.076 10.2787 16.062C10.4987 15.195 13.9987 11.937 15.9987 9.99997C16.7837 9.23897 16.4257 8.79997 15.4987 9.49997C13.1957 11.238 9.5007 13.881 8.2787 14.625C7.2007 15.281 6.6387 15.393 5.9667 15.281C4.7407 15.077 3.6037 14.761 2.6757 14.376C1.4217 13.856 1.4827 12.132 2.6747 11.63L19.7747 4.42997Z"
        fill="#CD068E"
      />
    </g>
    <defs>
      <clipPath id="clip0_6638_14036">
        <rect width="24" height="24" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

export default TelegramMagentaIcon;
