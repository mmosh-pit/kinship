type Props = {
  selectedPartyFilter: string[];
  handleChangePartyFilterValue: (val: string) => void;
};

const PartyFilters = ({
  selectedPartyFilter,
  handleChangePartyFilterValue,
}: Props) => (
  <div className="w-full flex flex-col">
    <h6>Party</h6>

    <div className="w-full flex items-center justify-start mt-2">
      <div
        className="flex items-center justify-center mr-2"
        onClick={(_) => {
          handleChangePartyFilterValue("DEM");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedPartyFilter.includes("DEM")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Dem</p>
      </div>

      <div
        className="flex items-center justify-center md:mx-2 mx-1"
        onClick={(_) => {
          handleChangePartyFilterValue("REP");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedPartyFilter.includes("REP")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Rep</p>
      </div>

      <div
        className="flex items-center justify-center md:mx-2 mx-1"
        onClick={(_) => {
          handleChangePartyFilterValue("IND");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedPartyFilter.includes("IND")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Ind</p>
      </div>

      <div
        className="flex items-center justify-center md:mx-2 mx-1"
        onClick={(_) => {
          handleChangePartyFilterValue("GRE");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedPartyFilter.includes("GRE")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Green</p>
      </div>

      <div
        className="flex items-center justify-center md:mx-2 mx-1"
        onClick={(_) => {
          handleChangePartyFilterValue("LIB");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedPartyFilter.includes("LIB")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Lib</p>
      </div>

      <div
        className="flex items-center justify-center md:mx-2 mx-1"
        onClick={(_) => {
          handleChangePartyFilterValue("OTHER");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedPartyFilter.includes("OTHER")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Other</p>
      </div>
    </div>
  </div>
);

export default PartyFilters;
