import { userWeb3Info } from "@/app/(main)/store";
import { useAtom } from "jotai";
import moment from 'moment';
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

const Notification = (props:any) => {
  const router = useRouter();

  const openProfile = () => {
    router.push("/"+props.data.receiver.profile.username)
  }

  return (
    <div className="flex rounded-2xl bg-gradient-to-r from-[#FFFFFF]/20 via-[#FFFFFF]/9 to-[#FFFFFF]/5 px-2 items-center py-1 my-2  cursor-pointer" onClick={()=>{openProfile()}}>
        <img src={props.data.sender.length > 0 ? props.data.sender[0].guest_data.picture : props.data.receiver.length > 0 ? props.data.receiver[0].guest_data.picture : "https://img.freepik.com/free-vector/hand-drawn-nft-style-ape-illustration_23-2149622021.jpg"} className="w-8 h-8 rounded-full" />
        {/* <img src={"https://img.freepik.com/free-vector/hand-drawn-nft-style-ape-illustration_23-2149622021.jpg"} className="w-8 h-8 rounded-full " /> */}
        <div className="notification-content ml-2">
            <p className="text-base">{props.data.message}</p>
            <p className="text-tiny text-light-gray">{moment(props.data.created_date).fromNow()}</p>
        </div>
    </div>
  );
};

export default Notification;
