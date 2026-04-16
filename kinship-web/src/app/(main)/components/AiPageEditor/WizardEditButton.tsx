"use client";

import React from "react";
import { useAtom } from "jotai";
import { data } from "@/app/(main)/store";
import { isAiEditorOpen } from "@/app/(main)/store";

const WizardEditButton = () => {
    const [currentUser] = useAtom(data);
    const [, setIsOpen] = useAtom(isAiEditorOpen);

    if (currentUser?.role !== "wizard") return null;

    return (
        <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#EB8000]/20 border border-[#EB8000]/40 hover:bg-[#EB8000]/30 hover:border-[#EB8000]/60 transition-all text-[#EB8000] text-sm font-semibold font-avenir group"
            title="Edit landing page with AI"
        >
            <span className="text-base group-hover:rotate-12 transition-transform">
                ✏️
            </span>
            <span className="hidden xl:inline">Edit Page</span>
        </button>
    );
};

export default WizardEditButton;
