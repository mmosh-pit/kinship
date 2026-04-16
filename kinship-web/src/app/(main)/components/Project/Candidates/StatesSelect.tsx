import React from "react";
import ArrowDown from "@/assets/icons/ArrowDown";
import ArrowUp from "@/assets/icons/ArrowUp";
import { states } from "@/utils/states";
import useCheckMobileScreen from "@/app/(main)/lib/useCheckMobileScreen";

type Props = {
  onChange: (value: string) => void;
  selectedElement: string;
};

const StatesSelect = ({ onChange, selectedElement }: Props) => {
  const isMobile = useCheckMobileScreen();
  const divRef = React.useRef<HTMLDivElement>(null);
  const divWrapperRef = React.useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = React.useState(false);
  const [displayItems, setDisplayItems] = React.useState(false);
  const animating = React.useRef(false);

  React.useEffect(() => {
    if (!isOpen) {
      animating.current = true;
      setTimeout(() => {
        setDisplayItems(false);
        animating.current = false;
      }, 100);
      return;
    }

    setDisplayItems(true);
  }, [isOpen]);

  const toggleContainer = () => {
    if (animating.current) return;
    setIsOpen(!isOpen);
  };

  const handleClickOutside = React.useCallback(
    (event: any) => {
      if (
        divWrapperRef.current &&
        !divWrapperRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    },
    [isOpen],
  );

  React.useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [divWrapperRef]);

  return (
    <div className="flex flex-col w-full relative">
      <h6>States</h6>

      <div
        className={`states-select absolute md:top-[10px] px-4 mt-4`}
        style={{
          height: !isOpen
            ? `${isMobile ? "30px" : "50px"}`
            : `${isMobile ? "300px" : "500px"}`,
        }}
        ref={divWrapperRef}
      >
        <div
          className="w-full flex justify-between items-center self-center"
          onClick={toggleContainer}
        >
          <div className="flex flex-wrap" ref={divRef}>
            <p className="text-xs text-white font-bold">
              {states[selectedElement] || "All"}
            </p>
          </div>

          {isOpen ? <ArrowUp /> : <ArrowDown />}
        </div>
        {displayItems && (
          <div className="custom-select-open">
            <div className="w-full h-[1px] bg-[#6E5FB1] px-2 my-2" />

            {Object.entries(states).map(([key, value]: any) => {
              return (
                <div
                  className="flex items-center my-2 cursor-pointer"
                  key={key}
                  onClick={() => {
                    onChange(key);
                    toggleContainer();
                  }}
                >
                  <p className="text-white text-xs">{value}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatesSelect;
