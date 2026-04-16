"use client";
import axios from "axios";
import React, { useEffect, useState } from "react";
import TeamItem from "./TeamItem";

const Teams = (teamsData: any) => {
    const [loading, setLoading] = useState(false)
    const [teamData, setTeamData] = React.useState([]);

    useEffect(()=>{
       listMyTeamsApi()
       console.log("teams call")
    },[])


    const listMyTeamsApi = async () => {
      try {
        setLoading(true)
        let url = "/api/project/myteams?wallet=" + teamsData.address;
        let apiResult = await axios.get(url);
        console.log("api result", apiResult.data)
        setTeamData(apiResult.data)
        setLoading(false);
      } catch (error) {
        setLoading(false);
        setTeamData([]);
      }
    };

    return (

        <div className="mt-6">
            {loading &&
                <div className="text-center text-gray-500 pb-6">
                <p className="text-lg font-medium">Loading...</p>
                </div>
            }
            {!loading && teamData.length == 0 &&
                <div className="text-center text-gray-500 pb-6">
                <p className="text-lg font-medium">No Data Available</p>
                </div>
            }

            {!loading && teamData.length > 0 &&
                <div className="px-4">
                {teamData.map((item: any, index: number) => (
                    <TeamItem data={item} address={teamsData.address} onRefresh={()=>{
                        listMyTeamsApi()
                    }} />
                ))}
                </div>
            }
        </div>
        

    )
}

export default Teams;