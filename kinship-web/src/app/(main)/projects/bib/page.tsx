"use client"
import Button from "../../components/common/Button";
import Select from "../../components/common/Select";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bars } from "react-loader-spinner";
let source:any;
const PTVLeaderBoard = () => {
    const [leaderLoading, setLeaderLoading] = useState(true);
    const [keyword, setKeyword] = useState("")
    const [leaders, setLeaders] = useState([]);
    const [coinType, setCoinType] = useState("");
    const coinList = [
        {
          label: "Both Teams",
          value: "",
        },
        {
          label: "Blue Team",
          value: "Blue",
        },
        {
          label: "Red Team",
          value: "Red",
        }
      ];
      
    useEffect(()=>{
        setKeyword("")
        getLeaderBoardAPI("");
    },[coinType])

    const searchLeader = (searchKeyword:any) => {
        setKeyword(searchKeyword);
        getLeaderBoardAPI(searchKeyword);
    }

    const getLeaderBoardAPI = async (keyword:any) => {
        try {
            if(source) {
                source.cancel();
                source = null
            }
            source = axios.CancelToken.source();
            setLeaderLoading(true)
            let url = "/api/ptv/leaderboard"
            if(coinType !=="") {
                url = url + "?type="+coinType
            }
            if(keyword.length > 0) {
                if(coinType !== "") {
                    url = url + "&&searchText=" + keyword
                } else {
                    url = url + "?searchText=" + keyword
                }
            } 
            const listResult = await axios.get(url,{
                cancelToken: source.token
            });
            setLeaders(listResult.data)
            setLeaderLoading(false)
        } catch (error) {
            setLeaderLoading(false)
            setLeaders([])
        }
    }

    const onViewBlink = (leaderItem:any) => {
        window.open("https://dial.to/?action=solana-action:"+process.env.NEXT_PUBLIC_APP_MAIN_URL+"/api/actions/guest-pass?referer="+leaderItem.pass, "_blank")
    }

    const onViewTwitter = (leaderItem:any) => {
        window.open(leaderItem.twitter, "_blank")
    }

    return (
        <div className="relative background-content">
            <div className="container mx-auto my-10">
                <div className="relative w-full md:flex justify-between">
                    <h2 className="text-center text-white font-goudy font-normal text-xl leading-10 py-0.5"> Blink In Bio leaderboard</h2>
                    <div className="flex">
                        <div className="relative flex search-container">
                            <button className="btn btn-circle bg-search h-11 w-11 min-h-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
                            </button>
                            <input type="text" placeholder="Search by name" className="input bg-transparent px-2.5 h-11 border-0 focus:outline-0 text-xs w-52" onChange={(event) => searchLeader(event.target.value)}/>
                        </div>
                        <div className="ml-3.5">
                            <Select
                            value={coinType}
                            onChange={(e) =>
                                setCoinType(e.target.value)
                            }
                            options={coinList}
                            />
                        </div>

                    </div>
                </div>

            </div>

            <div className="container mx-auto pb-12">
               {leaders.length > 0 && !leaderLoading &&
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {leaders.map((leaderItem: any, index: any) => (
                            <div className="relative leader-container p-3.5">
                               <div className="absolute">
                                {leaderItem.profiles.length > 0 &&
                                   <>
                                      {leaderItem.profiles[0].profile &&
                                        <img src={leaderItem.profiles[0].profile.image} alt="profile" className="w-20 h-20 rounded-full" />
                                      }
                                      {!leaderItem.profiles[0].profile &&
                                        <img src="https://storage.googleapis.com/mmosh-assets/ptv/logo.jpg" alt="profile" className="w-20 h-20 rounded-full" />
                                      }

                                   </>
                                    
                                }
                                {leaderItem.profiles.length === 0 &&
                                    <img src="https://storage.googleapis.com/mmosh-assets/ptv/logo.jpg" alt="profile" className="w-20 h-20 rounded-full" />
                                }
                               </div>
                               <div className="pl-20">
                                 <div className="pl-3.5">
                                    <h3 className="text-white font-goudy text-header-small-font-size capitalize">{leaderItem.name}</h3>
                                    <p className="text-white text-para-font-size">PTVB Rewards: {leaderItem.bluereward} PTVB</p>
                                    <p className="text-white text-para-font-size">PTVR Rewards: {leaderItem.redreward} PTVR</p>
                                    <div className="mt-3.5 flex gap-4">
                                        <Button
                                            isPrimary={false}
                                            action={()=>{onViewTwitter(leaderItem)}}
                                            title="Follow on X"
                                            size="small"
                                            disabled={false}
                                            isLoading={false}
                                        />
                                        <Button
                                            isPrimary={false}
                                            action={()=>{onViewBlink(leaderItem)}}
                                            title="View Blink"
                                            size="small"
                                            disabled={false}
                                            isLoading={false}
                                        />
                                    </div>
                                 </div>
                               </div>
                            </div>
                        ))}
                    </div>
                }
                {leaderLoading &&
                    <div className="mx-auto w-20">
                        <Bars
                            height="80"
                            width="80"
                            color="rgba(255, 0, 199, 1)"
                            ariaLabel="bars-loading"
                            wrapperStyle={{}} 
                            wrapperClass="bars-loading"
                            visible={leaderLoading}
                        />
                    </div>
                }


                {(leaders.length == 0 && !leaderLoading) &&
                    <div className="text-center text-xs">Data not available</div>
                }
            </div>
        </div>
    )
}

export default PTVLeaderBoard