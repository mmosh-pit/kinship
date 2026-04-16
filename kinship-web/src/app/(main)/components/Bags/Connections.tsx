"use client";
import axios from "axios";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Radio from "../common/Radio";
import useWallet from "@/utils/wallet";
import useConnection from "@/utils/connection";
import { useAtom } from "jotai";
import { data } from "@/app/(main)/store";
import ConnectionItem from "./ConnectionItem";

const Connections = (connectionData: any) => {
    const router = useRouter();
    const [loading, setLoading] = useState(false)
    const [connections, setConnections] = React.useState([]);
    const [allData, setAllData] = React.useState([]);
    const [selectType, setSelectType] = React.useState("all")
    const wallet = useWallet();
    const connection = useConnection();
    const [currentUser] = useAtom(data);

    useEffect(()=>{
       if(wallet) {
            console.log("start fetching connections...")
            listConnectionsApi()
       }
    },[wallet])

    useEffect(()=>{
        setConnections([])
        const result = allData.filter((item: any) =>
            selectType === "all" ? true :
            selectType === "accepted" ? item.status === 1 :
            item.status === 0
        );
        setConnections(result)
    },[selectType])

    const listConnectionsApi = async () => {
      try {
        setLoading(true)
        let url = "/api/connections/list?wallet=" + connectionData.address;
        let apiResult = await axios.get(url);
        console.log("api result", apiResult)
        setAllData(apiResult.data);
        const result = apiResult.data.filter((item: any) =>
            selectType === "all" ? true :
            selectType === "accepted" ? item.status === 1 :
            item.status === 0
        );
        setConnections(result)
        setLoading(false);
      } catch (error) {
        setLoading(false);
        setConnections([]);
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
                    title="Accepted"
                    checked={selectType == "accepted"}
                    onChoose={() => {
                        setSelectType("accepted")
                    }}
                    name={`radio-open-1`}
                />
                <Radio
                    title="Pending"
                    checked={selectType == "pending"}
                    onChoose={() => {
                        setSelectType("pending")
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
                {!loading && connections.length == 0 &&
                    <div className="text-center text-gray-500 pb-6">
                    <p className="text-lg font-medium">No Connections Available</p>
                    </div>
                }

                {!loading && connections.length > 0 &&
                    <div className="px-14">
                    {connections.map((item: any, index: number) => (
                        <ConnectionItem 
                           wallet={wallet}
                           currentuser={currentUser!}
                           user={item}
                           badge={item.badge}
                           key={item.badge}
                           onRefresh={()=>{
                               listConnectionsApi()
                           }}
                        />
                    ))}
                    </div>
                }
            </div>
        </>

    )
}

export default Connections;