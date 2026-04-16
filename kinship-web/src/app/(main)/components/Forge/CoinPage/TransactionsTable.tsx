import React from "react";
import { useAtom } from "jotai";
import axios from "axios";
import Image from "next/image";

import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import { coinStats } from "@/app/(main)/store/coins";
import { abbreviateNumber } from "@/app/(main)/lib/abbreviateNumber";
import SortIcon from "@/assets/icons/SortIcon";
import { walletAddressShortener } from "@/app/(main)/lib/walletAddressShortener";
import { calculateTimeForTransactionTable } from "@/app/(main)/lib/dateUtils";
import currencyFormatter from "@/app/(main)/lib/currencyFormatter";

type Props = {
  coin: CoinDetail;
  base: Coin;
};

const TransactionsTable = ({ coin, base }: Props) => {
  const [_, setStats] = useAtom(coinStats);

  const [isLastPage, setIsLastPage] = React.useState(false);
  const [history, setHistory] = React.useState<any>([]);

  const fetchDirectory = async (page: any) => {
    try {
      const url = `/api/list-coin-transactions?page=${page}&bonding=${coin.bonding}`;

      const apiResult = await axios.get(url);
      let nf = new Intl.NumberFormat("en-US");
      if (apiResult.data.history.length > 0) {
        const newHistory = [];
        for (let index = 0; index < apiResult.data.history.length; index++) {
          const element = apiResult.data.history[index];
          element.total =  nf.format(element.usdcPrice * element.value) + " USDC";
          newHistory.push(element);
        }
        setHistory(newHistory);
      }

      const dayVolume = abbreviateNumber(apiResult.data.day);
      const monthVolume = abbreviateNumber(apiResult.data.month);
      const yearVolume = abbreviateNumber(apiResult.data.year);

      setStats((prev) => ({ ...prev, dayVolume, monthVolume, yearVolume }));

      if (apiResult.data.history.length < 10) {
        setIsLastPage(true);
      }
    } catch (error) {
      setHistory([]);
    }
  };

  React.useEffect(() => {
    fetchDirectory(0);
  }, []);

  return (
    <div className="w-full flex flex-col">
      <div className="my-4 ml-4">
        <h5>Transactions</h5>
      </div>

      <table className="w-full bg-[#100E5242] rounded-md overflow-x-auto">
        <thead>
          <tr>
            <th align="center">
              <div className="flex items-center justify-center">
                <SortIcon />
                <p className="text-white text-sm ml-2">Time</p>
              </div>
            </th>
            <th align="center">
              <p className="text-white text-sm">Type</p>
            </th>

            <th align="center">
              <p className="text-white text-sm">Price</p>
            </th>

            <th align="center">
              <p className="text-white text-sm">Amount</p>
            </th>

            <th align="center">
              <p className="text-white text-sm">Total</p>
            </th>

            {/* <th align="center">
              <p className="text-white text-sm">{base.symbol}</p>
            </th>

            <th align="center">
              <p className="text-white text-sm">For</p>
            </th>

            <th align="center">
              <p className="text-white text-sm">USD</p>
            </th>
  */}
            <th align="center">
              <p className="text-white text-sm">Wallet</p>
            </th> 
          </tr>
        </thead>

        <tbody>
          {history.map((item: any, index: number) => (
            <tr
              className={`${index % 2 === 0 ? "bg-[#100E5242] hover:bg-[#100E5230]" : "bg-[#07076E70] hover:bg-[#07076E60]"} cursor-pointer`}
              key={coin.symbol}
              onClick={()=> window.open("https://solscan.io/tx/"+item.tx, "_blank")}
            >
              <td align="center">
                <p className="text-white text-sm">
                  {calculateTimeForTransactionTable(
                    new Date(),
                    new Date(item.created_date),
                  )}
                </p>
              </td>

              <td align="center">
                <p
                  className={`capitalize text-sm ${item.type === "sell" ? "text-red-600" : "text-green-500"}`}
                >
                  {item.type}
                </p>
              </td>

              <td align="center">
                <p className="text-white text-sm">
                  {item.value / (item.price * item.value)} {item.basesymbol.toUpperCase()}
                </p>
              </td>

              <td align="center">
                <p className="text-white text-sm">
                  {item.price * item.value} {item.targetsymbol.toUpperCase()}
                 </p>
              </td>

              <td align="center">
                <p className="text-white text-sm">
                  {item.total}
                 </p>
              </td>

              <td align="center">
                <p className="text-white text-sm">
                  {walletAddressShortener(item.wallet)}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TransactionsTable;
