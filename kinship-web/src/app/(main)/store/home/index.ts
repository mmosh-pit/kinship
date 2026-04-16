import { atom } from "jotai";

export const selectedSearchFilter = atom(["all"]);

export const typedSearchValue = atom("");

export const selectedCoinsMode = atom("list");

export const selectedDirectory = atom("mmosh");

export const alreadyWaiting = atom(false);
