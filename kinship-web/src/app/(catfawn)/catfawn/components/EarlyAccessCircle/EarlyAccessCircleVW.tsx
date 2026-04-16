export const EarlyAccessCircleVW = () => {
  return (
    <div className="flex flex-col gap-[1.875rem]">
      <h1 className="font-poppinsNew text-[2.188rem] max-md:text-2xl font-bold leading-tight max-lg:text-center bg-gradient-to-r from-[#FFFFFF] to-[#FFFFFF88] bg-clip-text text-transparent">
        Join Kinship Early Access
      </h1>

      <div className="text-[1rem] font-avenir max-md:px-5 text-[#FFFFFFE5] leading-[130%] max-md:text-sm font-normal max-lg:text-start text-wrap max-lg:mb-3">
        <p className="font-avenir">
          Be among the first to experience Kinship Systems as it comes to life.
        </p>

        <p className="font-avenir">As an early access member, you&apos;ll:</p>

        <ul className="list-disc pl-6">
          <li>
            Explore the app before public launch — Practice with early{" "}
            <br className="max-lg:hidden" />
            scenarios, test features, and help us refine the experience
          </li>
          <li>
            Shape what we build — Your insights, questions, and results will
            <br className="max-lg:hidden" />
            directly influence how Kinship evolves
          </li>
          <li>
            Connect with the community — Join live sessions and private
            gatherings <br className="max-lg:hidden" /> with our Founding Sages,
            the Kinship team, and fellow early adopters
          </li>
        </ul>
        <p className="font-avenir">
          Early Access is limited and by application. We're looking for people{" "}
          who want
          <br className="max-lg:hidden" />
          to grow alongside the platform—not just try it out, but help shape it
          into being.
        </p>
      </div>
    </div>
  );
};
