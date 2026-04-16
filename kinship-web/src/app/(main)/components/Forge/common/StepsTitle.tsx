type Props = {
  name: string;
  title: string;
  subtitle: string;
};

const StepsTitle = ({ name, title, subtitle }: Props) => (
  <div className="flex flex-col justify-center items-center">
    <h3 className="text-center text-white font-goudy font-normal">{name}</h3>
    <h4 className="text-center text-white font-goudy font-normal my-2">
      {title}
    </h4>
    <p className="text-center text-sm mt-1">{subtitle}</p>
  </div>
);

export default StepsTitle;
