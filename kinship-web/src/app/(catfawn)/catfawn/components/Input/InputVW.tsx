interface InputVWProps {
  labelText: string;
  value: string;
  placeHolder: string;
  inputType: string;
  isRequired: boolean;
  type: string;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const InputVW = (props: InputVWProps) => {
  const {
    labelText,
    value,
    placeHolder,
    inputType,
    isRequired,
    type,
    minLength,
    maxLength,
    onChange,
  } = props;
  return (
    <div className={type === "sms" ? "mt-[0.25rem]" : ""}>
      <label
        className={`block text-[#FFFFFFCC] mb-[0.313rem] leading-[100%] ${type === "sms" && "text-[0.813rem]"}`}
      >
        {labelText}
        {isRequired && "*"}
      </label>
      <input
        type={inputType}
        placeholder={placeHolder}
        className={`w-full ${type === "kinship-code" ? "h-[3.438rem]" : "h-[2.813rem]"} px-[1.25rem] py-[0.813rem] rounded-lg bg-[#FFFFFF14] backdrop-blur-[20.16px] border border-[#FFFFFF29] text-white focus:outline-none placeholder:text-[#FFFFFF] placeholder:opacity-20`}
        value={value}
        onChange={onChange}
        minLength={minLength}
        maxLength={maxLength}
      />
    </div>
  );
};
