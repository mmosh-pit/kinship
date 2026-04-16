import { userWeb3Info } from "@/app/(main)/store";
import { useAtom } from "jotai";
import moment from 'moment';
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "../common/Button";

const ProfileConnection = (props:any) => {
  const [userData, setUserData] = useState<any>()
  const router = useRouter();

  const openProfile = () => {
    router.push("/"+userData.profile.username+"/reqests")
  }

  useEffect(()=>{
    if(props.type == "requests" || props.type == "followers") {
        setUserData({
            profile: {
                username: props.data.sender.profile.username,
                image: props.data.sender.profile.image
            }
         })
    } else {
        setUserData({
            profile: {
                username: props.data.receiver.profile.username,
                image: props.data.receiver.profile.image
            }
         })
    }
  },[])

  return (
    <>
        {userData &&
            <div className="relative leader-container p-3.5" onClick={()=>{openProfile()}}>
                <img src={userData.profile.image} className="w-14 h-14 rounded-full absolute left-3.5 top-3.5" />
                <div className="connection-content pl-[66px] flex flex-col justify-center item-center">
                    <p className="text-base capitalize font-goudy">{userData.profile.username}</p>
                    {props.type === "requests" &&
                        <div className="flex gap-4">
                            <Button
                                isPrimary={false}
                                action={()=>{}}
                                title="Accept"
                                size="small"
                                disabled={false}
                                isLoading={false}
                            />
                            <Button
                                isPrimary={false}
                                action={()=>{}}
                                title="Cancel"
                                size="small"
                                disabled={false}
                                isLoading={false}
                            />
                        </div>
                    }

                </div>
            </div>
        }
    </>

  );
};

export default ProfileConnection;
