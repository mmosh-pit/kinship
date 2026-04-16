type Props = {
  children: React.ReactNode;
};

const DefaultCard = ({ children }: Props) => (
  <div className="flex items-center px-2 py-4 bg-[#030007] bg-opacity-40 rounded-lg">
    {children}
  </div>
);

export default DefaultCard;
