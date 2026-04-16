type Props = React.SVGProps<SVGSVGElement>;

const AddIcon = (props: Props) => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g filter="url(#filter0_bi_9226_17162)">
      <rect
        x="1"
        y="1"
        width="28"
        height="28"
        rx="14"
        fill="#9A9A9A"
        fillOpacity="0.07"
      />
      <rect
        x="1"
        y="1"
        width="28"
        height="28"
        rx="14"
        stroke="#9F9F9F"
        strokeOpacity="0.22"
      />
    </g>
    <path
      d="M21.25 15C21.25 15.1989 21.171 15.3897 21.0303 15.5303C20.8897 15.671 20.6989 15.75 20.5 15.75H15.75V20.5C15.75 20.6989 15.671 20.8897 15.5303 21.0303C15.3897 21.171 15.1989 21.25 15 21.25C14.8011 21.25 14.6103 21.171 14.4697 21.0303C14.329 20.8897 14.25 20.6989 14.25 20.5V15.75H9.5C9.30109 15.75 9.11032 15.671 8.96967 15.5303C8.82902 15.3897 8.75 15.1989 8.75 15C8.75 14.8011 8.82902 14.6103 8.96967 14.4697C9.11032 14.329 9.30109 14.25 9.5 14.25H14.25V9.5C14.25 9.30109 14.329 9.11032 14.4697 8.96967C14.6103 8.82902 14.8011 8.75 15 8.75C15.1989 8.75 15.3897 8.82902 15.5303 8.96967C15.671 9.11032 15.75 9.30109 15.75 9.5V14.25H20.5C20.6989 14.25 20.8897 14.329 21.0303 14.4697C21.171 14.6103 21.25 14.8011 21.25 15Z"
      fill="white"
    />
    <defs>
      <filter
        id="filter0_bi_9226_17162"
        x="-38.5"
        y="-38.5"
        width="107"
        height="107"
        filterUnits="userSpaceOnUse"
        color-interpolation-filters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feGaussianBlur in="BackgroundImageFix" stdDeviation="19.5" />
        <feComposite
          in2="SourceAlpha"
          operator="in"
          result="effect1_backgroundBlur_9226_17162"
        />
        <feBlend
          mode="normal"
          in="SourceGraphic"
          in2="effect1_backgroundBlur_9226_17162"
          result="shape"
        />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset />
        <feGaussianBlur stdDeviation="1" />
        <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"
        />
        <feBlend
          mode="normal"
          in2="shape"
          result="effect2_innerShadow_9226_17162"
        />
      </filter>
    </defs>
  </svg>
);

export default AddIcon;
