import Image from "next/image";
import React from "react";
import {Camera} from "react-camera-pro";
import { v4 as uuidv4 } from "uuid";

type Props = {
  changeImage: (file: File | null) => void;
  image: string;
  rounded?: boolean;
};

const errorParams =   {
    noCameraAccessible: 'No camera device accessible. Please connect your camera or try a different browser.',
    permissionDenied: 'Permission denied. Please refresh and give camera permission.',
    switchCamera:
    'It is not possible to switch camera to different one because there is only one video device accessible.',
    canvas: 'Canvas is not supported.'
  }


const CameraPicker = ({ changeImage, image, rounded }: Props) => {
   const camera = React.useRef<any>(null);
   const [startCamera, setStartCamera] = React.useState(false)
   const imageContainerRef = React.useRef<HTMLInputElement>(null);
   const [imageHeight, setImageHeight] = React.useState(0);

   const openCamera = () => {
      setStartCamera(true)
   }

   const onCameraSave = () => {
       if(!camera.current) {
        return
       }
       const photo = camera.current.takePhoto();
       changeImage(dataURLtoFile(photo));
       setStartCamera(false)
   }

   React.useLayoutEffect(() => {
    if (imageContainerRef.current !== null) {
      const { width } = imageContainerRef.current.getBoundingClientRect();
      setImageHeight(width);
    }
  }, [image]);

  const dataURLtoFile = (dataurl:any) =>  {
    const fileName = uuidv4() + ".jpeg";
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], fileName, {type:mime});
}

  

   return (
        <>
        {!startCamera &&
            <div
                className="w-full h-full"
                ref={imageContainerRef}
                >
                {image ? (
                    <>
                    <div className="flex flex-col">
                    <div
                        className="flex w-full relative"
                        style={{ height: imageHeight + "px" }}
                    >
                        <Image
                        src={image}
                        alt="Identity"
                        fill
                        objectFit="cover"
                        className={rounded ? "rounded-full" : ""}
                     
                        />
                    </div>
                    </div>
                    <div className="flex justify-center mt-3.5">
                    <button className="btn btn-sm bg-primary text-white border-none hover:bg-primary hover:text-white font-normal text-xs" onClick={openCamera}>Retake Image</button>
                    </div>
                    
                    </>
        
        
                ) : (
                    <>
                        <div
                        className="flex flex-col justify-center items-center border-[1px] border-solid border-[#FFF] border-opacity-20 rounded-md select-none cursor-pointer backdrop-container"
                        style={{ height: imageHeight + "px" }}
                        >
                        <p className="text-base font-montserrat text-para-font-size leading-3 font-light text-center">
                            Take a selfie with your photo ID <br/> (school ID, drivers license or passport)
                        </p>
                        <div className="relative py-1.5">
                            <Image src="/selfie.png" alt="png" width={64} height={64} />
                        </div>
                        </div>
                        <div className="flex justify-center mt-3.5">
                        <button className="btn btn-sm bg-primary text-white border-none hover:bg-primary hover:text-white font-normal text-xs" onClick={openCamera}>Take a Selfie</button>
                        </div>
                    </>
                )}
            </div>
        }

        {startCamera &&
            <>
                <div
                className="w-full h-full"
                >
                        <div
                        className="flex flex-col justify-center items-center border-[1px] border-solid border-[#FFF] border-opacity-20 rounded-md select-none cursor-pointer backdrop-container"
                        style={{ height: imageHeight + "px" }}
                        >
                            <Camera ref={camera} errorMessages={errorParams} />
                        </div>
                        <div className="flex justify-center mt-3.5">
                           <button className="btn btn-sm bg-primary text-white border-none hover:bg-primary hover:text-white font-normal text-xs" onClick={onCameraSave}>Take Photo</button>
                        </div>
                </div>
            </>
        }

        </>

   );
};

export default CameraPicker;
