type Props = React.SVGProps<SVGSVGElement>;

const MinusIcon = (props: Props) => (
<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_bi_9226_17032)">
<rect x="1" y="1" width="28" height="28" rx="14" fill="#9A9A9A" fillOpacity="0.07"/>
<rect x="1" y="1" width="28" height="28" rx="14" stroke="#9F9F9F" strokeOpacity="0.22"/>
</g>
<rect x="9" y="14" width="12" height="2" rx="1" fill="white"/>
<defs>
<filter id="filter0_bi_9226_17032" x="-38.5" y="-38.5" width="107" height="107" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood floodOpacity="0" result="BackgroundImageFix"/>
<feGaussianBlur in="BackgroundImageFix" stdDeviation="19.5"/>
<feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_9226_17032"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_backgroundBlur_9226_17032" result="shape"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset/>
<feGaussianBlur stdDeviation="1"/>
<feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="shape" result="effect2_innerShadow_9226_17032"/>
</filter>
</defs>
</svg>
);

export default MinusIcon;


