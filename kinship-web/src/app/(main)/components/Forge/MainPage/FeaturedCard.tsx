type Props = {
  children: React.ReactNode;
};

const FeaturedCard = ({ children }: Props) => (
  <div className="flex items-center py-8 px-6 rounded-lg featured-card">
    {children}
  </div>
);

export default FeaturedCard;
