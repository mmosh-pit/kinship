import React from "react";
import Image from "next/image";
import { useAtom } from "jotai";

import { Coin } from "@/app/(main)/models/coin";
import Input from "../../common/Input";
import Button from "../../common/Button";
import { mintCommunityPass } from "@/app/(main)/lib/forge/mintCommunityPass";
import { pageCommunity, targetTokenBalance } from "@/app/(main)/store/community";
import { userWeb3Info } from "@/app/(main)/store";
import useWallet from "@/utils/wallet";

type Props = {
  image: string;
  price: number;
  coin: Coin;
  projectInfo: any;
  solBalance: number;
};

const CommunityPassMint = ({
  image,
  price,
  coin,
  projectInfo,
  solBalance,
}: Props) => {
  const [community] = useAtom(pageCommunity);
  const [userInfo] = useAtom(userWeb3Info);

  const wallet = useWallet();
  const [isLoading, setIsLoading] = React.useState(false);
  const [amountToMint, setAmountToMint] = React.useState(0);
  const [mintStatus, setMintStatus] = React.useState("Mint");

  const [result, setResult] = React.useState({
    type: "",
    message: "",
  });

  const [balance] = useAtom(targetTokenBalance);

  const mintPass = async () => {
    if (amountToMint <= 0) return;

    if (projectInfo?.profiles?.length > 0) {
      setResult({
        type: "info",
        message:
          "Hey! The wallet you've connected is already holding a Community Pass NFT. Instead of minting another, mint some Invitations to earn royalties and make your Community bigger!",
      });

      return;
    }

    if (solBalance === 0) {
      setResult({
        type: "warn",
        message: `Hey! We checked your wallet and you don't have enough SOL to mint.`,
      });
      return;
    }

    if (balance < price / 1000_000_000) {
      setResult({
        type: "warn",
        message: `Hey! We checked your wallet and you don't have enough ${coin.symbol} to mint.`,
      });
      return;
    }

    if (projectInfo?.invitationPrice > 0) {
      if (projectInfo?.activationTokens?.length <= 0) {
        setResult({
          type: "info",
          message:
            "Hey! An Invitation from this Community is required to mint a Community Pass and join.",
        });
        return;
      }
    }

    setResult({ type: "", message: "" });

    setIsLoading(true);
    const res = await mintCommunityPass({
      projectInfo,
      community: community!,
      wallet: wallet!,
      setMintStatus,
      profile: userInfo?.profile.address!,
    });

    setResult({ type: res.type, message: res.message });

    setIsLoading(false);
  };

  const getTextResultColor = React.useCallback(() => {
    if (result.type === "success") return "text-green-500";

    if (result.type === "error") return "text-red-400";

    if (result.type === "warn") return "text-orange-500";

    return "text-white";
  }, [result]);

  return (
    <div className="community-page-container-card px-6 py-4 rounded-xl">
      <h6>Community Passes</h6>

      <div className="self-center w-[10vmax] h-[10vmax] relative mt-4">
        <Image src={image} alt="Invitation" layout="fill" />
      </div>

      <div className="w-[75%] self-center flex flex-col my-4">
        <Input
          type="text"
          title="Project Passes"
          value={amountToMint.toString()}
          required={false}
          onChange={(e) => {
            const value = Number(e.target.value);

            if (Number.isNaN(value)) return;

            if (value < 0) return;

            setAmountToMint(value);
          }}
          placeholder="0"
        />
      </div>

      <div className="flex flex-col justify-center items-center">
        {result.message && (
          <p
            className={`text-tiny ${getTextResultColor()} text-center mb-4 max-w-[80%]`}
          >
            {result.message}
          </p>
        )}
        <Button
          title={mintStatus}
          size="large"
          action={mintPass}
          isPrimary
          isLoading={isLoading}
          disabled={isLoading || amountToMint <= 0}
        />

        <p className="text-white text-sm self-center text-center">
          Price {price} {coin.symbol.toUpperCase()}
        </p>
        <label className="text-[0.5vmax] self-center text-center">
          Plus you will be charged a small amount of SOL in transaction fees.
        </label>
      </div>

      <div className="flex flex-col justify-center mt-2">
        <p className="text-sm self-center text-center">
          Current balance: <span className="mx-2">{balance}</span>{" "}
          {coin.symbol.toUpperCase()}
        </p>
        <p className="text-sm self-center text-center">
          Current balance: <span className="mx-2">{solBalance}</span> SOL
        </p>
      </div>
    </div>
  );
};

export default CommunityPassMint;
