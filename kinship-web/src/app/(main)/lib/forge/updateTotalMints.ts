import internalClient from "../internalHttpClient";

export const updateTotalMints = async (totalMints: any) => {
  await internalClient.post("/api/set-option", {
    name: "totalmints",
    value: totalMints,
  });
};
