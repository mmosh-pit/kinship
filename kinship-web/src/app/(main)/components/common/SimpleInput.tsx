import { ChangeEventHandler, ClipboardEventHandler, LegacyRef } from "react";

type Props = {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  reference?: LegacyRef<HTMLInputElement>;
  onPaste?: ClipboardEventHandler<HTMLInputElement>;
  maxLength?: number;
  height?: string;
};

const SimpleInput = ({
  value,
  onChange,
  placeholder,
  reference,
  onPaste,
  maxLength,
  height
}: Props) => (
  <input
    ref={reference}
    value={value}
    maxLength={maxLength}
    onChange={onChange}
    onPaste={onPaste}
    placeholder={placeholder}
    className={`input input-bordered ${height ? `h-[${height}]` : "h-[2vmax]"} max-w-[100%] text-center text-xs bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] p-0`}
  />
);

export default SimpleInput;
