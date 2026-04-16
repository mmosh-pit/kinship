"use client";
import axios from "axios";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Radio from "../common/Radio";
import useWallet from "@/utils/wallet";
import useConnection from "@/utils/connection";
import { useAtom } from "jotai";
import { data } from "@/app/(main)/store";
import OfferItem from "./OfferItem";

const Offers = (offerData: any) => {
    const [loading, setLoading] = useState(false)
    const [offers, setOffers] = React.useState([]);
    const [allData, setAllData] = React.useState([]);
    const [selectType, setSelectType] = React.useState("all")
    const wallet = useWallet();
    const [currentUser] = useAtom(data);

    useEffect(()=>{
       if(wallet) {
            console.log("start fetching offers...")
            listMyOfferApi()
       }
    },[wallet])

    useEffect(()=>{
        setOffers([])
        const result = allData.filter((item: any) =>
            selectType === "all" ? true :
            selectType === "offers" ? item.isinvte === 0 :
            item.isinvte === 1
        );
        setOffers(result)
    },[selectType])

    const listMyOfferApi = async () => {
      try {
        setLoading(true)
        let url = "/api/offer/mylist?wallet=" + offerData.address;
        let apiResult = await axios.get(url);
        console.log("api result", apiResult.data)
        setAllData(apiResult.data);
        const result = apiResult.data.filter((item: any) =>
            selectType === "all" ? true :
            selectType === "offers" ? item.isinvte === 0 :
            item.isinvte === 1
        );
        setOffers(result)
        setLoading(false);
      } catch (error) {
        setLoading(false);
        setOffers([]);
      }
    };

    return (
        <>
            <div className="flex items-center justify-center bg-[#2E3C4E80]">
                <Radio
                    title="All"
                    checked={selectType == "all"}
                    onChoose={() => {
                        setSelectType("all")
                    }}
                    name={`radio-open-0`}
                />
                <Radio
                    title="Offers"
                    checked={selectType == "offers"}
                    onChoose={() => {
                        setSelectType("offers")
                    }}
                    name={`radio-open-1`}
                />
                <Radio
                    title="Invitations"
                    checked={selectType == "invitations"}
                    onChoose={() => {
                        setSelectType("invitations")
                    }}
                    name={`radio-open-2`}
                />
            </div>
            <div className="mt-6">
                {loading &&
                    <div className="text-center text-gray-500 pb-6">
                    <p className="text-lg font-medium">Loading...</p>
                    </div>
                }
                {!loading && offers.length == 0 &&
                    <div className="text-center text-gray-500 pb-6">
                    <p className="text-lg font-medium">No Data Available</p>
                    </div>
                }

                {!loading && offers.length > 0 &&
                    <div className="px-4">
                    {offers.map((item: any, index: number) => (
                        <OfferItem data={item.offer} status={item.status} isinvite={item.isinvte} invitekey={item.key} address={offerData.address} onRefresh={()=>{
                            listMyOfferApi()
                        }} />
                    ))}
                    </div>
                }
            </div>
        </>

    )
}

export default Offers;