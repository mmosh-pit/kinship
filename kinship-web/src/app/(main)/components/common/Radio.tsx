type Props = {
  checked: boolean;
  onChoose: () => void;
  title: string;
  name?: string;
  disabled?: boolean;
};

const Radio = ({ checked, onChoose, title, name }: Props) => (
  <div className="form-control">
    <label className="label cursor-pointer">
      <input
        type="radio"
        name={name ?? "radio-10"}
        className="radio checked:bg-primary"
        checked={checked}
        onChange={() => {
          onChoose();
        }}
      />
      <span className="label-text pl-1 md:pr-2.5 text-white md:text-xs text-[0.5rem]">
        {title}
      </span>
    </label>
  </div>
);

export default Radio;
