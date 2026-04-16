import { useAtom } from "jotai";

import { lineage } from "@/app/(main)/store";

const LineageFilterOptions = () => {
  const [lineageOptions, setLineageOptions] = useAtom(lineage);

  const toggleChangeOption = (field: string) => {
    const newValues = [...lineageOptions].map((val) => {
      if (val.value === field) {
        val.selected = !val.selected;
      }

      return { ...val };
    });

    setLineageOptions(newValues);
  };

  return (
    <div className="relative flex self-start mt-4">
      {lineageOptions.map((option) => (
        <div
          key={option.value}
          className="flex justify-center items-center md:mx-4 mx-1 cursor-pointer relative"
          onClick={() => toggleChangeOption(option.value)}
        >
          <input
            type="radio"
            name={`radio-${option.value}`}
            className="radio"
            checked={option.selected}
            onChange={() => {}}
          />
          <p className="md:text-base text-sm text-white md:ml-4 ml-2">
            {option.label} <span className="text-xs">({option.subLabel})</span>
          </p>
        </div>
      ))}
    </div>
  );
};

export default LineageFilterOptions;
