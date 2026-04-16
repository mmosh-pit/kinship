type Props = {
  selectedColor: string[];
  handleChangeFilterValue: (value: string) => void;
};

const PartyColorFilters = ({
  selectedColor,
  handleChangeFilterValue,
}: Props) => (
  <div className="flex items-center mt-4">
    <div
      className="flex items-center justify-center"
      onClick={(_) => {
        handleChangeFilterValue("DEM");
      }}
    >
      <input
        id="radio1"
        type="radio"
        className="radio radio-secondary candidates-checkboxes"
        checked={selectedColor.includes("DEM")}
        onChange={() => {}}
      />
      <p className="text-white text-base md:ml-2">Blue</p>
    </div>

    <div
      className="flex items-center justify-center mx-4"
      onClick={(_) => {
        handleChangeFilterValue("REP");
      }}
    >
      <input
        id="radio1"
        type="radio"
        className="radio radio-secondary candidates-checkboxes"
        checked={selectedColor.includes("REP")}
        onChange={() => {}}
      />
      <p className="text-white text-base md:ml-2">Red</p>
    </div>
  </div>
);

export default PartyColorFilters;
