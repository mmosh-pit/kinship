"use client"
import React, { useEffect, useState } from "react"
const TokenCard = (tokenData: any) => {
    return (
        <>
        {tokenData &&
            <div className="relative border-b border-white border-opacity-20 p-2.5 cursor-pointer" onClick={()=>{tokenData.onChoose(tokenData.data)}}>
                <div className="absolute w-16 left-0 top-2">
                    <img src={tokenData.data.image} className="w-16 h-16 object-cover rounded-full" />
                </div>
                <div className="pl-16 h-16 flex flex-col justify-center">
                    <h5 className="text-xs font-goudy text-white">{tokenData.data.name}</h5>
                    <p className="text-para-font-size light-gray-color">{tokenData.data.symbol}</p>
                </div>
            </div>
        }

        </>

    )
}

export default TokenCard

