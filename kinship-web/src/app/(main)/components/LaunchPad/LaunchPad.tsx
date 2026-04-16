import React from "react";
import BigNumber from "bignumber.js";

interface LaunchPadProps {
  getCountDownValues: any;
  creator: string;
  buyToken: any;
  presale: any;
  isBuying: boolean;
}
export const LaunchPad = (props: LaunchPadProps) => {
  const { getCountDownValues, creator, buyToken, presale, isBuying } = props;
  const [timerData] = React.useState<any[]>([
    { label: "Days" },
    { label: "Hours" },
    { label: "Minutes" },
    { label: "Seconds" },
  ]);
  const [amount, setAmount] = React.useState("");
  const [token, setToken] = React.useState(0);
  const [currentTranche, setCurrentTranche] = React.useState(0);

  const handleAmount = (
    event: React.ChangeEvent<HTMLInputElement>,
    tokenInfo: any
  ) => {
    setAmount(event.target.value);
    const calculatedToken = (
      Number(event.target.value) / tokenInfo.presaleDetail.launchPrice +
      (Number(event.target.value) *
        Number(tokenInfo.presaleDetail.discount[currentTranche].percentage)) /
        100
    ).toFixed(9);
    setToken(Number(calculatedToken));
  };
  const getTrancheLabel = (index: number) => {
    const labels = ["1st Tranche", "2nd Tranche", "3rd Tranche", "4th Tranche"];
    if (currentTranche !== index) {
      setCurrentTranche(index);
    }
    return labels[index];
  };
  const renderTranche = (data: any) => {
    let available: number = 0;
    for (let index = 0; index < data.presaleDetail.discount.length; index++) {
      const element = data.presaleDetail.discount[index];
      available += Number(element.value);
      if (available - data.presaleDetail.totalSold > 0) {
        return (
          <div className=" flex flex-col items-start mt-5 ml-[10px] text-white font-['Avenir LT Std',sans-serif]">
            <div className="font-black text-[12px] leading-[1] mb-[8px] tracking-[-0.04em]">
              {getTrancheLabel(index)}
            </div>
            <div className="flex gap-[10px] mb-[6px]">
              <div
                key={index}
                className="w-[50px] h-[27px] rounded-[4px] bg-[#3C39BE33]  flex flex-col items-center justify-center"
              >
                <div className="text-[9px] font-bold">Available</div>
                <div className="text-[8px] font-light">
                  {available - data.presaleDetail.totalSold}
                </div>
              </div>
              <div
                key={index}
                className="w-[50px] h-[27px] rounded-[4px] bg-[#3C39BE33]  flex flex-col items-center justify-center"
              >
                <div className="text-[9px] font-bold">Purchased</div>
                <div className="text-[8px] font-light">
                  {new BigNumber(Number(element.value))
                    .minus(
                      new BigNumber(available - data.presaleDetail.totalSold)
                    )
                    .toString()}
                </div>
              </div>
              <div
                key={index}
                className="w-[50px] h-[27px] rounded-[4px] bg-[#3C39BE33] flex flex-col items-center justify-center"
              >
                <div className="text-[9px] font-bold">Discount</div>
                <div className="text-[8px] font-light">
                  {element.percentage}%
                </div>
              </div>

            </div>
            <div className="flex gap-[5px]">
              <div
                key={index}
                className="w-[85px] h-[27px] rounded-[4px] bg-[#3C39BE33]  flex flex-col items-center justify-center text-center px-1"
              >
                <div className="text-[8.5px] font-bold leading-tight">
                  Max Supply
                </div>
                <div className="text-[8px] font-light">
                  {data.coinDetail.supply} {data.coinDetail.symbol}
                </div>
              </div>
              <div
                key={index}
                className="w-[85px] h-[27px] rounded-[4px] bg-[#3C39BE33]  flex flex-col items-center justify-center text-center px-1"
              >
                <div className="text-[8.5px] font-bold leading-tight">
                  Launch Price
                </div>
                <div className="text-[8px] font-light">
                  {data.presaleDetail.launchPrice} USDC
                </div>
              </div>
              <div
                key={index}
                className="w-[85px] h-[27px] rounded-[4px] bg-[#3C39BE33]  flex flex-col items-center justify-center text-center px-1"
              >
                <div className="text-[8.5px] font-bold leading-tight">
                  Market Cap
                </div>
                <div className="text-[8px] font-light">
                  {data.presaleDetail.launchMarketCap} USDC
                </div>
              </div>
            </div>
          </div>
        );
      }
    }
  };
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 9,
    }).format(amount);
  };
  return (
    <>
      <div className="relative lg:w-[27.5rem] w-full mb-12 lg:mr-16">
        {/* Header */}
        <div
          className="flex flex-col lg:flex-row rounded-t-[14px] py-2 px-1 
    lg:justify-between bg-gradient-to-r from-[#05195E] to-[#0A34C4]"
        >
          {/* Left section */}
          <div className="w-[75px] h-[75px] rounded-full border-[2px] border-[#040432] overflow-hidden bg-white shadow-md self-center lg:hidden">
            <img
              src={presale.coinDetail.image}
              alt="Token"
              className="w-full h-full object-cover "
            />
          </div>
          <div className="lg:ml-20 self-center">
            <div className="flex items-center">
              <div className="text-md text-white font-medium underline">
                {presale.coinDetail.name}{" "}
              </div>
              <span className="text-[#C2C2C2] ml-1">
                • {presale.coinDetail.symbol}
              </span>
            </div>
            <div className="text-[9px] text-[#3C99FF] underline">{creator}</div>
          </div>

          {/* Right section */}
          <div className="flex justify-center lg:justify-start mt-2 lg:mt-0 px-1.5 py-1 rounded-xl bg-gradient-to-r from-[#1C1A584D] to-[#3C39BE4D]">
            {timerData.map((item, i) => (
              <React.Fragment key={i}>
                <div className="text-center px-2">
                  <div className="text-base text-white font-goudy">
                    {getCountDownValues(
                      new Date(presale.presaleDetail.lockPeriod).getTime() -
                        new Date().getTime(),
                      item.label
                    )}
                  </div>
                  <div className="text-[9px] text-white/70">{item.label}</div>
                </div>

                {i !== timerData.length - 1 && (
                  <div className="w-[1px] h-6 bg-white/30 self-center"></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="  bg-[#1A184D] rounded-b-xl lg:flex lg:justify-between px-2 py-1 font-poppins shadow-sm shadow-blue-900 ">
          {/* Left Side */}
          <div className="  pt-5  relative">
            <div className="absolute top-[-60px] lg:block hidden z-10">
              <div className="w-[75px] h-[75px] rounded-full border-[2px] border-[#040432] overflow-hidden bg-white shadow-md">
                <img
                  src={presale.coinDetail.image}
                  alt="Token"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <label className="text-[9px] font-extrabold mb-[2px] leading-none tracking-tight text-white">
              Amount
            </label>
            <div className="flex justify-between items-center mb-[5px]">
              <input
                type="number"
                placeholder="0.00"
                className="lg:w-[70px] h-[24px] max-w-100 px-2 rounded-[4px] border border-[#FF8FE7] bg-[rgba(255,143,231,0.08)] text-white text-[10px] font-normal outline-none pr-1 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={amount}
                onChange={(event) => handleAmount(event, presale)}
              />
              <span className="ml-[4px] text-[7px] text-white">USDC</span>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-white w-[80px] max-w-[380px] overflow-hidden whitespace-nowrap truncate">
                {formatAmount(token).replace(/[$,]/g, "").replace(/\.00$/, "")}
              </div>
              <div className="text-white text-[8px]">
                {presale.coinDetail.symbol}
              </div>
            </div>

            <div className="text-[#CFCFCF] text-[5.4px] mb-[2px]">
              Minimum: {presale.presaleDetail.purchaseMinimum} USDC
              <br />
              Maximum: {presale.presaleDetail.purchaseMaximum} USDC
            </div>

            <div
              className="px-2 py-1 bg-[#FF00AE] text-white rounded-[3px] text-[10px] font-bold m-auto text-center mx-3"
              onClick={() => buyToken(amount, token)}
            >
              {isBuying ? "Buying" : "Buy"}
            </div>

            <p className="text-[0.281rem] text-white mt-1 text-center">
              Plus a small amount of SOL for gas fees
            </p>
          </div>

          {/* Right Side */}
          {renderTranche(presale)}
        </div>
      </div>
    </>
  );
};