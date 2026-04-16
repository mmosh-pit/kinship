import { useAtom } from "jotai";

import { connectionTypes } from "@/app/(main)/store";
import { Hearts } from "react-loader-spinner";
import HeartSvg from "./HeartSvg";
import EmptyHeartSvg from "./EmptyHeartSvg";
import InBoundHeart from "./InBoundHeart";
import LinkedHeartSvg from "./LinkedHeartSvg";

const ConnectionFilterOptions = () => {
  const [connectionOptions, setConnectionOptions] = useAtom(connectionTypes);

  const toggleChangeOption = (field: string) => {
    const newValues = [...connectionOptions].map((val) => {
      if (val.value === field) {
        val.selected = !val.selected;
      }

      return { ...val };
    });

    setConnectionOptions(newValues);
  };

  return (
    <div className="relative flex self-start mt-2">
      {connectionOptions.map((option) => (
        <div
          key={option.value}
          className="flex justify-center items-center mx-4 cursor-pointer relative"
          onClick={() => toggleChangeOption(option.value)}
        >
          <input
            type="radio"
            name={`radio-${option.value}`}
            className="radio"
            checked={option.selected}
            onChange={() => {}}
          />
          <p className="text-base text-white ml-2">
            <span className="text-xs">
                {option.label === "unlinked" &&
                  <EmptyHeartSvg />
                }
                {option.label === "following" &&
                  <HeartSvg />
                }
                {option.label === "follower" &&
                  <InBoundHeart />
                }
                {option.label === "linked" &&
                  <LinkedHeartSvg />
                }
            </span>
          </p>
        </div>
      ))}
    </div>
  );
};

export default ConnectionFilterOptions;
