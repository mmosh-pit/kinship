"use client";

import ImagePicker from "../ImagePicker";
import Button from "../common/Button";
import Input from "../common/Input";
import Radio from "../common/Radio";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { pinImageToShadowDrive } from "@/app/(main)/lib/uploadImageToShdwDrive";
import { uploadFile } from "@/app/(main)/lib/firebase";


export default function Minting({ onMenuChange, createMessage }: { onMenuChange: any, createMessage: any }) {
    
    const navigate = useRouter();
    const [fields, setFields] = useState({
        image: {
            preview: "",
            type: ""
        },
        name: "", 
        symbol: "",
        desc: "",
        supply: 0,
    })
    const [loading, setLoading] = useState(false)
    const [image, setImage] = React.useState<File | null>(null);

    const [isReady, setIsReady] = useState(false)

    React.useEffect(() => {
        if (!image) return;
        const objectUrl = URL.createObjectURL(image);
        let imageObj = {
            preview: objectUrl,
            type: image.type
        }
        setFields({ ...fields, image: imageObj })
    }, [image]);
    
    React.useEffect(()=>{
        if(localStorage.getItem("coinstep1")) {
          let savedData:any = localStorage.getItem("coinstep1");
          setFields(JSON.parse(savedData));
          setIsReady(true)
        }
    },[])

    React.useEffect(()=>{
       setIsReady(validateFields(false))
    },[fields])

    const validateFields = (isMessage:boolean) => {
        if (fields.name.trim().length == 0) {
          if(isMessage) {
            createMessage("Name is required", "danger-container");
          }  
    
          return false;
        }

        if (fields.name.trim().length > 50) {
            if(isMessage) {
               createMessage("Name should have less than 50 characters", "danger-container");
            }
            return false;
        }
    
        if (fields.symbol.trim().length == 0) {
            if(isMessage) {
               createMessage("Symbol is required", "danger-container");
            }
          return false;
        }

        if (fields.symbol.trim().length > 10) {
            if(isMessage) {
                createMessage("Symbol should have less than 10 characters", "danger-container");
            }
            return false;
        }
    
        if (fields.desc.trim().length == 0) {
            if(isMessage) {
              createMessage("Description is required", "danger-container");
            }
          return false;
        }

        if (fields.desc.trim().length > 160) {
            if(isMessage) {
                createMessage("Description should have less than 160 characters", "danger-container");
            }
            return false;
        }
    
        if(fields.image.preview.trim().length == 0) {
            if(isMessage) {
                createMessage("Community coin image is required", "danger-container");
            }
            return false;
        }

        return true;
    };

    const gotoPresale = async () => {
        setLoading(true);
        if(validateFields(true)) {
            if(!isValidHttpUrl(fields.image.preview)) {
                let imageFile = await fetch(fields.image.preview).then(r => r.blob()).then(blobFile => new File([blobFile], uuidv4(), { type: fields.image.type }));
                // let imageUri = await pinImageToShadowDrive(imageFile)
                 const date = new Date().getMilliseconds();
                const imageUri = await uploadFile(imageFile, `${fields.name}-banner-${date}`, "user-images");
                fields.image.preview = imageUri;
            }
            localStorage.setItem("coinstep1",JSON.stringify(fields));
            onMenuChange("presale")
        }
    }

    const prepareNumber = (inputValue:any) => {
        if(isNaN(inputValue)) {
            return 0
        }
        return inputValue;
    }

    const isValidHttpUrl = (url:any) => {
        try {
          const newUrl = new URL(url);
          return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
        } catch (err) {
          return false;
        }
    }

    return (
        <>
            <div className="relative background-content">
                <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                            <ImagePicker changeImage={setImage} image={fields.image.preview} />
                            </div>
                            <div>
                                <div className="form-element pt-2.5">
                                    <Input
                                        type="text"
                                        title="Name"
                                        required
                                        helperText="Up to 50 characters, can have spaces."
                                        placeholder="Name"
                                        value={fields.name}
                                        onChange={(e) => setFields({ ...fields, name: e.target.value })}
                                    />
                                </div>
                                <div className="form-element pt-2.5">
                                    <Input
                                        type="text"
                                        title="Symbol"
                                        required
                                        helperText="Symbol can only be letters and numbers up to 10 characters"
                                        placeholder="Symbol"
                                        value={fields.symbol}
                                        onChange={(e) => setFields({ ...fields, symbol: e.target.value })}
                                    />
                                </div>
                                <div className="form-element pt-2.5">
                                    <Input
                                        type="text"
                                        title="Maxium Token Supply"
                                        required
                                        helperText="The maximum number of tokens that can be created"
                                        placeholder="Supply"
                                        value={(fields.supply > 0 ? fields.supply.toString() : "")}
                                        onChange={(e) => setFields({ ...fields, supply: prepareNumber(Number(e.target.value))})}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="form-element h-full">
                                    <Input
                                        textarea
                                        type="text"
                                        title="Description"
                                        required
                                        helperText=""
                                        placeholder="Describe your Community Coin and associated project and protocol."
                                        value={fields.desc}
                                        onChange={(e) => setFields({ ...fields, desc: e.target.value })}
                                    />
                                </div>
                            </div>
                    </div>
                    <div className="flex justify-center mt-10">
                        {!loading &&
                            <>
                                <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white" onClick={gotoPresale} disabled={!isReady}>Next</button>
                            </>
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