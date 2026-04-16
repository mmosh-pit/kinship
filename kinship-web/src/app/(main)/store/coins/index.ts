import { atom } from "jotai";

export const selectedUSDCCoin = atom(false);
export const coinTextSearch = atom("");

export const selectedVolume = atom({ label: "1M Volume", value: "1m" });

export const coinStats = atom({
  dayVolume: "",
  monthVolume: "",
  yearVolume: "",
  total: "",
});

export const selectedDateType = atom("day");

export const pair = atom("All");
