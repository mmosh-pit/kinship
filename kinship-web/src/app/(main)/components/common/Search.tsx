import SearchIcon from "@/assets/icons/SearchIcon";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  darker?: boolean;
};

const Search = ({ value, onChange, placeholder, darker }: Props) => (
  <div
    className={`w-full flex items-center  ${darker ? "bg-[#38465840] border-[#FFFFFF06]" : "bg-[#38465880] border-[#FFFFFF30]"} border-[1px] rounded-full md:p-3 p-1`}
  >
    <SearchIcon />
    <input
      placeholder={placeholder || "Search"}
      className="ml-1 w-full bg-transparent outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export default Search;
