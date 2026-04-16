"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import KinshipBots from "@/assets/icons/KinshipBots";
import Button from "@/app/(main)/components/common/Button";
import { data, isAuth, isAuthModalOpen, isAuthOverlayOpen } from "@/app/(main)/store";
import client from "@/app/(main)/lib/httpClient";

export default function PageHeader() {
  const router = useRouter();
  const [isUserAuthenticated, setIsUserAuthenticated] = useAtom(isAuth);
  const [, setShowAuthOverlay] = useAtom(isAuthOverlayOpen);
  const [, setIsAuthModalOpen] = useAtom(isAuthModalOpen);
  const [currentUser, setCurrentUser] = useAtom(data);
  const [isLoadingLogout, setIsLoadingLogout] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const result = await client.get("/is-auth");
        const user = result.data?.data?.user;
        setShowAuthOverlay(!user);
        setIsAuthModalOpen(!user);
        setIsUserAuthenticated(!!user);
        setCurrentUser(user);
      } catch {}
    })();
  }, []);

  const logout = async () => {
    if (isLoadingLogout) return;
    setIsLoadingLogout(true);
    await client.delete("/logout", {});
    window.localStorage.removeItem("token");
    setIsLoadingLogout(false);
    setIsUserAuthenticated(false);
    setCurrentUser(null);
    setIsAuthModalOpen(false);
    setShowAuthOverlay(true);
  };

  return (
    <header className="w-full fixed flex justify-center z-10">
      <div className="flex justify-between items-center max-2xl:container px-4 max-xl:py-4 py-8 bg-[#32323212] backdrop-filter backdrop-blur-[13px] sm:rounded-full w-full 2xl:mx-40 self-center">
        <button onClick={() => router.push("/")}>
          <KinshipBots />
        </button>

        <div className="flex items-center gap-3 font-bold">
          {currentUser == null ? (
            <Button
              action={() => router.push("/login")}
              size="small"
              isPrimary
              title="Login"
              isLoading={false}
            />
          ) : (
            <Button
              action={logout}
              size="small"
              isPrimary
              title="Logout"
              isLoading={isLoadingLogout}
            />
          )}
        </div>
      </div>
    </header>
  );
}
