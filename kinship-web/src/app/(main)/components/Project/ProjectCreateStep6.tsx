"use client";

import ImagePicker from "../ImagePicker";
import Button from "../common/Button";
import Input from "../common/Input";
import Radio from "../common/Radio";
import Select from "../common/Select";
import AddIcon from "@/assets/icons/AddIcon";
import Calender from "@/assets/icons/Calender";
import MinusIcon from "@/assets/icons/MinusIcon";
import TimeIcon from "@/assets/icons/TimeIcon";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function ProjectCreateStep6({ onPageChange }: { onPageChange: any }) {
    const navigate = useRouter();
    const [loading, setLoading] = useState(false)
    const [showMsg, setShowMsg] = useState(false);
    const [msgClass, setMsgClass] = useState("");
    const [msgText, setMsgText] = useState("");

    const [isReady, setIsReady] = useState(false)
    
    const [coinDetails, setCoinDetails] = useState({
        image: {preview: "", type: ""},
        name: "", 
        symbol: "",
        desc: "",
        supply: 0,
        listingPrice: 0,
    })

    const [presaleDetails, setPresaleDetails] = useState({
        presaleStartDate: "",
        presaleStartTime: "",
        presaleEndDate: "",
        presaleEndTime: "",
        dexListingDate: "",
        dexListingTime: "",
        maxPresale: 0,
        minPresale: 0
    })

    const [fields, setFields] = useState<any>([]);

    const [communities, setCommunities] = useState({
        communities: [],
        profiles: []
    })

    React.useEffect(()=>{
        if(localStorage.getItem("projectstep2")) {
            let savedData:any = localStorage.getItem("projectstep2");
            setCommunities(JSON.parse(savedData));
        }

        if(localStorage.getItem("projectstep3")) {
           let savedData:any = localStorage.getItem("projectstep3");
           setCoinDetails(JSON.parse(savedData));
        }

        if(localStorage.getItem("projectstep4")) {
            let savedData:any = localStorage.getItem("projectstep4");
            setPresaleDetails(JSON.parse(savedData));
         }

         if(localStorage.getItem("projectstep6")) {
            let savedData:any = localStorage.getItem("projectstep6");
            setFields(JSON.parse(savedData));
         }
         
    },[])

    React.useEffect(()=>{
        if(communities.profiles.length > 0) {
            let roles:any = []
            let newTokenomics:any = []
            for (let index = 0; index < communities.profiles.length; index++) {
                const element:any = communities.profiles[index];
                if(!roles.includes(element.role)) {
                    newTokenomics.push({label:element.role, value:element.role})
                    roles.push(element.role);
                }
            }
            setTokenomics(newTokenomics)
    
            let newFields:any = [{
                type: newTokenomics[0].label,
                value: 0,
                cliff:{
                    months: 0,
                    percentage: 0
                },
                vesting:{
                    months: 0,
                    percentage: 0
                },
            }];
            setFields(newFields)
        }

    },[communities])


    const [tokenomics, setTokenomics] = useState([])

    const [distribution, setDistribution] = useState(1);

    const distributeAction = (type:any) => {
        if(type === "add") {
            setDistribution(distribution + 1);
        } else {
           if(distribution > 1) {
            setDistribution(distribution - 1);
           }
        }
      }

    

     const gotoStep7 = () => {
         setLoading(true)
         if(getTotalTokenomics() !== 100) {
            setLoading(false)
            createMessage("Total percentage should add up to 100%", "danger-container");
            return
         }

         localStorage.setItem("projectstep6",JSON.stringify(fields));
         onPageChange("step7")
     }

     React.useEffect(()=>{
        setIsReady(getTotalTokenomics() === 100)
    },[fields])

     const goBack = () => {
        if(presaleDetails.minPresale === 0) {
            onPageChange("step4")
        } else {
            onPageChange("step5")
        }
   
     }

     const createMessage = (message: any, type: any) => {
        window.scrollTo(0, 0);
        setMsgText(message);
        setMsgClass(type);
        setShowMsg(true);
        if(type == "success-container") {
          setTimeout(() => {
            setShowMsg(false);
          }, 4000);
        } else {
          setTimeout(() => {
            setShowMsg(false);
          }, 4000);
        }
    };

    const updateTokenomics = (i:any, fieldItem:any) => {
        console.log(i)
        console.log(fieldItem)
        let newTokenomics = [];
        for (let index = 0; index < fields.length; index++) {
            if(i == index) {
                newTokenomics.push(fieldItem);
            } else {
                newTokenomics.push(fields[index]);
            }
        }
        setFields(newTokenomics)
    }

    const removeTokenomics = (i:any) => {
        let newTokenomics = [];
        for (let index = 0; index < fields.length; index++) {
            if(i == index) {
               continue;
            } 
            newTokenomics.push(fields[index]);
        }
        setFields(newTokenomics)
    }

    const addTokenomics = () => {
        let newTokenomics:any = [];
        for (let index = 0; index < fields.length; index++) {
            newTokenomics.push(fields[index]);
        }
        newTokenomics.push({
            type: "Investor",
            value: 0,
            cliff:{
                months: 0,
                percentage: 0
            },
            vesting:{
                months: 0,
                percentage: 0
            },
        })
        setFields(newTokenomics)
    }

    const prepareNumber = (inputValue:any) => {
        if(isNaN(inputValue)) {
            return 0
        }
        return inputValue;
    }

    const getTotalTokenomics = () => {
        let totalPercentage = 3 + presaleDetails.maxPresale;
        for (let index = 0; index < fields.length; index++) {
           const element = fields[index];
           totalPercentage = totalPercentage + element.value
        }

        return totalPercentage;

    }



    return (
        <>
            {showMsg && (
                <div className={"message-container text-white text-center text-header-small-font-size py-5 px-3.5 " + msgClass}>{msgText}</div>
            )}
            <div className="background-content">
                <div className="flex flex-col items-center justify-center w-full">
                    <div className="relative w-full flex flex-col justify-center items-center pt-5">
                        <div className="max-w-md">
                            <h2 className="text-center text-white font-goudy font-normal text-xl">Launch Your Project</h2>
                            <h3 className="text-center text-white font-goudy text-sub-title-font-size pt-2.5">Step 6</h3>
                            <h3 className="text-center text-white font-goudy font-normal text-sub-title-font-size pt-1.5">Set Tokenomics</h3>
                            <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">Set the token distribution plan for your Community Coin.</p>
                        </div>
                    </div>
                </div>

                <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
                    <div className="grid grid-cols-12">
                    <div className="col-span-12 lg:col-start-4 lg:col-span-6 xl:col-start-4 xl:col-span-6">
                            <div className="grid grid-cols-12 pb-5">
                                <div className="col-span-6">
                                    <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">Total number of tokens</p>
                                    <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">{coinDetails.supply} {coinDetails.symbol.toUpperCase()}</p>
                                </div>
                                <div className="col-span-6">
                                    <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">FDV</p>
                                    <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">{coinDetails.supply * coinDetails.listingPrice} USD</p>
                                </div>
                            </div>
                            <div className="backdrop-container rounded-xl py-10 px-10 border border-white border-opacity-20 mb-10 ">
                                <h3 className="text-sub-title-font-size text-while font-poppins mb-5 text-center">Tokenomics</h3>
                                {fields.map((fieldItem:any, i:any) => (
                                    <div className="mt-3.5">
                                        <div className="flex justify-center">
                                            <div className="grid grid-cols-4 gap-2">
                                                    <div className="flex">
                                                        {i!=0 &&
                                                            <div className="mt-1 pr-3.5 cursor-pointer" onClick={()=>{removeTokenomics(i)}}>
                                                                <MinusIcon />
                                                            </div>
                                                        }
                        
                                            
                                                        <Select
                                                        value={fieldItem.type}
                                                        onChange={(e) =>{
                                                            fieldItem.type = e.target.value;
                                                            updateTokenomics(i,fieldItem);

                                                        }}
                                                        options={tokenomics}
                                                        />

                                                    </div>
                                                    <Input
                                                        type="text"
                                                        title=""
                                                        required={false}
                                                        helperText=""
                                                        placeholder="%"
                                                        value={(fieldItem.value > 0 ? fieldItem.value.toString() : "")}
                                                        onChange={(e) => {fieldItem.value = prepareNumber(Number(e.target.value)); updateTokenomics(i, fieldItem) }}
                                                    />
                                                    <Input
                                                        type="text"
                                                        title=""
                                                        required={false}
                                                        helperText=""
                                                        placeholder="--"
                                                        value={(fieldItem.value > 0 ? (coinDetails.supply * (fieldItem.value / 100)).toString() : "")}
                                                        onChange={(e) => { }}
                                                    />
                                                    <Input
                                                        type="text"
                                                        title=""
                                                        required={false}
                                                        helperText=""
                                                        placeholder="--"
                                                        value={(fieldItem.value > 0 ? ((coinDetails.supply * (fieldItem.value / 100)) * coinDetails.listingPrice).toString() : "")}
                                                        onChange={(e) => { }}
                                                    />
                                            </div>
                                            <p className="leading-10 pl-2.5">USD</p>
                                        </div>
                                    </div>
                                ))}

                                <div className="mt-5 mb-10">
                                    <div className="cursor-pointer" onClick={()=>{addTokenomics()}}>
                                        <AddIcon />
                                    </div>
                                </div>
                                <div className="border-t border-white border-opacity-20">
                                    <div className="flex justify-center pt-5">
                                        <p className="text-header-small-font-size text-white max-w-32 pr-2.5">
                                        Tokens allocated for the presale
                                        </p>
                                            <p className="text-header-small-font-size text-white">
                                            {presaleDetails.maxPresale}%
                                        </p>
                                    </div>
                                    <div className="flex justify-center pt-5">
                                        <p className="text-header-small-font-size text-white min-w-32 pr-2.5">
                                        MMOSH DAO
                                        </p>
                                            <p className="text-header-small-font-size text-white">
                                            2%
                                        </p>
                                    </div>
                                    <div className="flex justify-center pt-2.5">
                                    <p className="text-header-small-font-size text-white min-w-32 pr-2.5">
                                        Curator
                                        <label className="text-small-font-size text-white block"> (Founder Agent)</label>
                                        </p>
                                            <p className="text-header-small-font-size text-white">
                                            1%
                                        </p>
                                    </div>
                                    <div className="flex justify-center pt-10">
                                        <p className="text-header-small-font-size text-white min-w-24 font-bold pr-2.5">
                                        Total
                                        </p>
                                            <p className="text-header-small-font-size text-white font-bold">
                                            {getTotalTokenomics()}%
                                        </p>
                                    </div>
                                </div>
                            </div>
        
                
                    </div>

                    </div>
                    <div className="flex justify-center mt-10">
                        <button className="btn btn-link text-white no-underline" onClick={goBack}>Back</button>
                        {!loading&&
                            <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white" disabled={!isReady} onClick={gotoStep7}>Next</button>
                        }

                        {loading &&
                            <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white">Loading...</button>
                        }
                    </div>
                </div>
            </div>
        </>

    );
}
