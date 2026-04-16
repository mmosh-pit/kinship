type Props = {
  selectedCandidateFilter: string[];
  handleChangeFilterValue: (value: string) => void;
};

const CandidateFilters = ({
  selectedCandidateFilter,
  handleChangeFilterValue,
}: Props) => (
  <div className="flex flex-col">
    <h6>Campaigns</h6>

    <div className="flex items-center mt-2">
      <div
        className="flex items-center justify-center"
        onClick={(_) => {
          handleChangeFilterValue("P");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedCandidateFilter.includes("P")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Presidential</p>
      </div>

      <div
        className="flex items-center justify-center mx-4"
        onClick={(_) => {
          handleChangeFilterValue("S");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedCandidateFilter.includes("S")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Senatorial</p>
      </div>

      <div
        className="flex items-center justify-center md:ml-2"
        onClick={(_) => {
          handleChangeFilterValue("H");
        }}
      >
        <input
          id="radio1"
          type="radio"
          className="radio radio-secondary candidates-checkboxes"
          checked={selectedCandidateFilter.includes("H")}
          onChange={() => {}}
        />
        <p className="text-white text-base md:ml-2">Congressional</p>
      </div>
    </div>
  </div>
);

export default CandidateFilters;
