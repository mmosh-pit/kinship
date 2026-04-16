import React from "react";
import Radio from "../common/Radio";
import { useAtom } from "jotai";
import { lineage, profileFilter } from "@/app/(main)/store";

type Props = {
  isGuest: boolean;
};

const ProfileFilters = ({ isGuest }: Props) => {
  const [selectedFilter, setSelectedFilter] = useAtom(profileFilter);
  const [lineageOptions, setLineageOptions] = useAtom(lineage);

  const toggleChangeOption = (field: string) => {
    const newValues = [...lineageOptions].map((val) => {
      if (val.value === field) {
        val.selected = !val.selected;
      }

      return { ...val };
    });

    setLineageOptions(newValues);
  };

  const getFilters = () => {
    if (selectedFilter === 1) {
      return (
        <div className="flex">
          <div className="flex flex-col">
            <p className="text-base text-white font-bold">Clan</p>

            <div className="flex flex-wrap">
              <Radio
                name="gen1"
                title="Gen 1"
                checked={
                  lineageOptions.find((e) => e.value === "gen1")?.selected ??
                  true
                }
                onChoose={() => toggleChangeOption("gen1")}
              />

              <Radio
                name="gen2"
                title="Gen 2"
                checked={
                  lineageOptions.find((e) => e.value === "gen2")?.selected ??
                  true
                }
                onChoose={() => toggleChangeOption("gen2")}
              />

              <Radio
                name="gen3"
                title="Gen 3"
                checked={
                  lineageOptions.find((e) => e.value === "gen3")?.selected ??
                  true
                }
                onChoose={() => toggleChangeOption("gen3")}
              />

              <Radio
                name="gen4"
                title="Gen 4"
                checked={
                  lineageOptions.find((e) => e.value === "gen4")?.selected ??
                  true
                }
                onChoose={() => toggleChangeOption("gen4")}
              />
            </div>
          </div>

          <div className="md:mx-8 mx-3" />

          <div className="flex flex-col">
            <p className="text-base text-white font-bold">Guild</p>

            <div className="flex flex-wrap wrap">
              <Radio
                name="disconnected"
                title="Disconnected"
                checked
                onChoose={() => { }}
              />

              <Radio
                name="inbound"
                title="Inbound"
                checked
                onChoose={() => { }}
              />

              <Radio
                name="outbound"
                title="Outbound"
                checked
                onChoose={() => { }}
              />

              <Radio name="mutual" title="Mutual" checked onChoose={() => { }} />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex">
        <Radio name="created" title="Created" checked onChoose={() => { }} />

        <div className="mx-2" />

        <Radio
          name="subscribed"
          title="Subscribed"
          checked
          onChoose={() => { }}
        />
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col bg-[#141343] rounded-lg md:px-12 px-4 py-6">
      {!isGuest && (
        <>
          <div className="flex items-center">
            <button onClick={() => setSelectedFilter(0)}>
              <p
                className={`text-lg text-white ${selectedFilter === 0 && "underline font-bold"}`}
              >
                Bots
              </p>
            </button>

            <div className="mx-8" />

            <button onClick={() => setSelectedFilter(1)}>
              <p
                className={`text-lg text-white ${selectedFilter === 1 && "underline font-bold"}`}
              >
                Connections
              </p>
            </button>
          </div>

          <div className="my-4" />

          {getFilters()}
        </>
      )}
    </div>
  );
};

export default ProfileFilters;
