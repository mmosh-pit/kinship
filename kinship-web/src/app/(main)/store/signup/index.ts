import { atom } from "jotai";

export const storeFormAtom = atom({
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  address: "",
});

export const incomingReferAddress = atom("");
