interface CheckBoxVWProps {
  labelText: string;
  hasChecked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}
export const CheckBoxVW = (props: CheckBoxVWProps) => {
  const { labelText, hasChecked, onChange } = props;
  return (
    <label className="flex items-center gap-0.5 cursor-pointer">
      <input
        type="checkbox"
        className="w-[1.438rem] h-[1.438rem] rounded-[0.313rem] bg-[#FFFFFF14] border-[1px] border-[#FFFFFF29] cursor-pointer"
        checked={hasChecked}
        onChange={onChange}
      />
      {labelText}
    </label>
  );
};
