"use client";

import React, { useState } from "react";
import axios from "axios";
import * as anchor from "@coral-xyz/anchor";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAtom } from "jotai";
import MobileDrawer from "./Profile/MobileDrawer";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { Connection } from "@solana/web3.js";
import Tabs from "./Header/Tabs";
import Notification from "./Notification/Notification";
import useWallet from "@/utils/wallet";
import KinshipBots from "@/assets/icons/KinshipBots";
import AlertModal from "./Modal";
import MessageBanner from "./common/MessageBanner";

const SOL_ADDR = "So11111111111111111111111111111111111111112";

const USDC_COIN = process.env.NEXT_PUBLIC_USDC_TOKEN;

const MMOSH_COIN = process.env.NEXT_PUBLIC_OPOS_TOKEN;

const PASS_COLLECTION = "PASSES";
const BADGE_COLLECTION = "BADGES";
const PROFILE_COLLECTION = "PROFILES";
import { nanoid } from "nanoid";
import { incomingReferAddress } from "@/app/(main)/store/signup";
import { currentGroupCommunity } from "@/app/(main)/store/community";
import { init } from "@/app/(main)/lib/firebase";
import useCheckDeviceScreenSize from "@/app/(main)/lib/useCheckDeviceScreenSize";
import { ProfileLineage } from "@/app/(main)/models/profileInfo";
import { getPriceForPTV } from "@/app/(main)/lib/forge/jupiter";
import { AssetsHeliusResponse } from "@/app/(main)/models/assetsHeliusResponse";
import client from "@/app/(main)/lib/httpClient";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import {
  data,
  isAuth,
  isAuthModalOpen,
  isAuthOverlayOpen,
  isDrawerOpen,
  signInModal,
  signInModalInitialStep,
  userWeb3Info,
  web3InfoLoading,
} from "@/app/(main)/store";
import {
  bagsBalance,
  BagsCoin,
  bagsCoins,
  BagsNFT,
  bagsNfts,
  genesisProfileUser,
} from "@/app/(main)/store/bags";

const Header = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const wallet = useWallet();
  const screenSize = useCheckDeviceScreenSize();

  const rendered = React.useRef(false);
  const renderedUserInfo = React.useRef(false);

  const [isLoadingLogout, setIsLoadingLogout] = useState(false);

  const [_, setReferAddress] = useAtom(incomingReferAddress);
  const [__, setProfileInfo] = useAtom(userWeb3Info);
  const [___, setIsLoadingProfile] = useAtom(web3InfoLoading);
  const [isUserAuthenticated, setIsUserAuthenticated] = useAtom(isAuth);
  const [_____, setShowAuthOverlay] = useAtom(isAuthOverlayOpen);
  const [________, setIsAuthModalOpen] = useAtom(isAuthModalOpen);
  const [currentUser, setCurrentUser] = useAtom(data);
  const [isDrawerShown] = useAtom(isDrawerOpen);
  const [bags, setBags] = useAtom(bagsCoins);
  const [__________, setBagsNFTs] = useAtom(bagsNfts);
  const [___________, setTotalBalance] = useAtom(bagsBalance);
  const [____________, setHasGenesisProfile] = useAtom(genesisProfileUser);

  const [isModalOpen, setIsModalOpen] = useAtom(signInModal);
  const [initialModalStep, setInitialModalStep] = useAtom(
    signInModalInitialStep
  );

  const [community] = useAtom(currentGroupCommunity);

  const param = searchParams.get("refer");
  const [membershipStatus, setMembershipStatus] = React.useState("na");

  const [pageViewCount, setPageViewCount] = React.useState(0);
  const [sessionId, setSessionId] = React.useState(
    localStorage.getItem("analytics_session") || nanoid()
  );
  const [isInitialized, setIsInitialized] = React.useState<boolean>(false);
  const [geo, setGeo] = React.useState({
    country: "Unknown",
    region: "Unknown",
    city: "Unknown",
    ip: "0.0.0.0",
  });
  const [notifications, setNotifications] = useState([]);
  const [badge, setBadge] = useState(0);

  React.useEffect(() => {
    if (!wallet) return;
    getGeolocation().then((result) => {
      setGeo(result);
    });

    trackPageView();
  }, [wallet]);

  const getTrafficSource = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const referrer = document.referrer;
    const utmSource = urlParams.get("utm_source");
    const utmMedium = urlParams.get("utm_medium");
    const utmCampaign = urlParams.get("utm_campaign");

    // UTM parameters take precedence
    if (utmSource) {
      return {
        source: utmSource,
        medium: utmMedium || "unknown",
        campaign: utmCampaign || undefined,
      };
    }

    // Bot referral tracking
    if (urlParams.get("bot_ref")) {
      return {
        source: "bot_external",
        medium: "bot",
        campaign: urlParams.get("bot_campaign") || undefined,
      };
    }

    // Referrer-based classification
    if (!referrer) {
      return { source: "direct", medium: "none" };
    }

    const referrerDomain = new URL(referrer).hostname.toLowerCase();
    const currentDomain = window.location.hostname.toLowerCase();

    if (referrerDomain === currentDomain) {
      return { source: "internal", medium: "referral" };
    }

    // Social media detection
    const socialPlatforms = [
      "facebook.com",
      "twitter.com",
      "x.com",
      "linkedin.com",
      "instagram.com",
      "youtube.com",
      "tiktok.com",
    ];
    if (socialPlatforms.some((platform) => referrerDomain.includes(platform))) {
      return { source: referrerDomain, medium: "social" };
    }

    // Search engine detection
    const searchEngines = [
      "google.",
      "bing.",
      "yahoo.",
      "duckduckgo.",
      "baidu.",
    ];
    if (searchEngines.some((engine) => referrerDomain.includes(engine))) {
      return { source: referrerDomain, medium: "organic" };
    }

    return { source: referrerDomain, medium: "referral" };
  };

  const getGeolocation = async (): Promise<any> => {
    try {
      const response = await axios.get("/api/get-geo-location", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      return await response.data;
    } catch (error) {
      return {
        country: "Unknown",
        region: "Unknown",
        city: "Unknown",
        ip: "0.0.0.0",
      };
    }
  };

  const trackPageView = async () => {
    setIsInitialized(true);
    if (typeof window === "undefined") return;

    const trafficSource = getTrafficSource();
    console.log("trafficSource", trafficSource);
    const urlParams = new URLSearchParams(window.location.search);

    const eventData = {
      event_id: nanoid(),
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      user_id: wallet?.publicKey.toBase58(),
      page_url: window.location.href,
      page_title: document.title,
      referrer: document.referrer || null,
      domain: window.location.hostname,
      traffic_source: trafficSource.source,
      traffic_medium: trafficSource.medium,
      traffic_campaign: trafficSource.campaign,
      bot_referrer_url: urlParams.get("bot_ref"),
      bot_referring_domain: urlParams.get("bot_ref")
        ? new URL(urlParams.get("bot_ref")!).hostname
        : null,
      user_agent: navigator.userAgent,
      device_type: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent)
        ? "mobile"
        : "desktop",
      browser:
        navigator.userAgent.match(/(Firefox|Chrome|Safari|Edge)/)?.[0] ||
        "Unknown",
      os: navigator.platform,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      ip: geo.ip,
      is_new_session: pageViewCount + 1 === 1,
      pageViewCount: pageViewCount,
      event_type: "page_view",
    };
    setPageViewCount(pageViewCount + 1);
    console.log("===== TRACK PAGE VIEW CALLED 3 =====", eventData);

    await trackEvent(eventData);
  };

  const trackEvent = async (eventData: any) => {
    if (!sessionId) return;
    try {
      await axios.post("/api/analytics/track", eventData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
    } catch (error) {}
  };

  React.useEffect(() => {
    if (param) {
      localStorage.setItem("refer", param);
      setReferAddress(param);
    } else {
      setReferAddress(process.env.NEXT_PUBLIC_DEFAULT_REFER_ADDRESS!);
    }
  }, [param]);

  const checkIfIsAuthenticated = React.useCallback(async () => {
    if (
      pathname === "/tos" ||
      pathname === "/privacy" ||
      pathname === "copyright" ||
      pathname === "license"
    )
      return;
    const url = `/is-auth`;

    try {
      const result = await client.get(url);

      const user = result.data?.data?.user;

      setShowAuthOverlay(!user);
      setIsAuthModalOpen(!user);
      setIsUserAuthenticated(!!user);
      setCurrentUser(user);

      if (user.onboarding_step < 4) {
        console.log("replacing because value; ", user.onboarding_step);
        router.replace("/account");
      }
    } catch (err) {
      // router.replace("/");
    }
  }, []);

  const getAllTokenAddreses = React.useCallback(async () => {
    const response = await internalClient.get("/api/get-all-coins-address");

    const data: any = response.data;

    const result: any = {};

    for (const value of data) {
      result[value.token] = true;
    }

    return result;
  }, [wallet]);

  const fetchAllBalances = React.useCallback(async () => {
    const allTokens = await getAllTokenAddreses();

    const response = await fetch(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: wallet?.publicKey.toBase58(),
          displayOptions: {
            showFungible: true,
            showCollectionMetadata: true,
            showUnverifiedCollections: true,
            showNativeBalance: true,
          },
          page: 1,
          limit: 1000,
        },
      }),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    let USDCPrice = 0;
    try {
      const mmoshUsdcPrice = await axios.get(
        `${process.env.NEXT_PUBLIC_JUPITER_PRICE_API}?ids=${process.env.NEXT_PUBLIC_OPOS_TOKEN},${process.env.NEXT_PUBLIC_USDC_TOKEN}`
      );
      USDCPrice = mmoshUsdcPrice.data?.data?.MMOSH?.price || 0;
    } catch (error) {
      console.error("Error fetching MMOSH price:", error);
      USDCPrice = 0;
    }

    const res: AssetsHeliusResponse = await response.json();

    let networkCoin: BagsCoin = {
      symbol: "SOL",
      decimals: 9,
      balance: res.result.nativeBalance.lamports,
      name: "Solana",
      image:
        "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      tokenAddress: SOL_ADDR,
      usdcPrice: Number(res.result.nativeBalance.price_per_sol.toFixed(2)),
      mmoshPrice: 0,
    };

    let stableCoin: BagsCoin | null = null;
    let nativeCoin: BagsCoin | null = null;

    const memecoins: BagsCoin[] = [];

    const exosystemCoins: BagsCoin[] = [];

    const badges: BagsNFT[] = [];

    const exosystemAssets: BagsNFT[] = [];

    const profiles: BagsNFT[] = [];
    const passes: BagsNFT[] = [];

    const nativeUsdcBalance = res.result.nativeBalance.total_price;

    let totalPriceInWallet = nativeUsdcBalance;

    for (const value of res.result.items) {
      if (value.interface === "FungibleToken") {
        if (value.token_info.decimals > 0) {
          const price = await getPriceForPTV(value.id);

          const coin = {
            name: value.content.metadata.name,
            image: value.content.links.image ?? "",
            symbol: value.content.metadata.symbol,
            balance: value.token_info.balance,
            tokenAddress: value.id,
            decimals: value.token_info.decimals,
            usdcPrice: price,
            mmoshPrice: 0,
          };

          if (value.id !== MMOSH_COIN) {
            const decimals = "1".padEnd(coin.decimals + 1, "0");

            const coinBalance = coin.balance / Number(decimals);

            totalPriceInWallet += coinBalance * price;
          }

          switch (value.id) {
            case SOL_ADDR:
              networkCoin = coin;
              break;
            case USDC_COIN:
              stableCoin = coin;
              break;
            case MMOSH_COIN:
              coin.usdcPrice = USDCPrice;
              const decimals = "1".padEnd(coin.decimals + 1, "0");
              const balance = value.token_info.balance / Number(decimals);
              coin.mmoshPrice = balance;

              totalPriceInWallet += coin.usdcPrice * balance;
              nativeCoin = coin;
              break;
            default:
              if (allTokens[value.id]) {
                memecoins.push(coin);
              } else {
                exosystemCoins.push(coin);
              }
          }
        } else {
          const badge = {
            name: value.content.metadata.name,
            image: value.content.links.image ?? "",
            symbol: value.content.metadata.symbol,
            balance: value.token_info.balance,
            tokenAddress: value.id,
            metadata: value.content.metadata,
          };
          if (value.group_definition && value.group_definition?.length > 0) {
            const collectionDefinition = value.grouping.find(
              (e) => e.group_key === "collection"
            );

            if (
              collectionDefinition?.collection_metadata?.symbol ===
              BADGE_COLLECTION
            ) {
              badges.push(badge);
            } else {
              exosystemAssets.push(badge);
            }
          }
        }
        continue;
      }

      const nft: BagsNFT = {
        name: value.content.metadata.name,
        image: value.content.links.image ?? "",
        symbol: value.content.metadata.symbol,
        balance: 1,
        tokenAddress: value.id,
        metadata: value.content.metadata,
      };

      if (nft.tokenAddress === web3Consts.genesisProfile.toBase58()) {
        setHasGenesisProfile(true);
      }

      const collectionDefinition = value.grouping.find(
        (e) => e.group_key === "collection"
      );

      if (
        collectionDefinition?.collection_metadata?.symbol === PROFILE_COLLECTION
      ) {
        profiles.push(nft);
        continue;
      }

      if (
        collectionDefinition?.collection_metadata?.symbol === PASS_COLLECTION
      ) {
        nft.parentKey = value.content.metadata.attributes?.find(
          (attr) =>
            attr.trait_type === "Community" || attr.trait_type === "Project"
        )?.value;

        passes.push(nft);
        continue;
      }
      exosystemAssets.push(nft);
    }

    setTotalBalance(totalPriceInWallet);

    setBags({
      native: nativeCoin,
      stable: stableCoin,
      network: networkCoin,
      exosystem: exosystemCoins.sort((a, b) => b.balance - a.balance),
      memecoins: memecoins.sort((a, b) => b.balance - a.balance),
    });

    setBagsNFTs({
      passes,
      profiles,
      badges,
      exosystem: exosystemAssets,
    });
  }, [wallet]);

  const getProfileInfo = async () => {
    try {
      console.log("===============================");
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
        {
          confirmTransactionInitialTimeout: 120000,
        }
      );
      const env = new anchor.AnchorProvider(connection, wallet!, {
        preflightCommitment: "processed",
      });

      setIsLoadingProfile(true);

      let userConn: UserConn = new UserConn(env, web3Consts.programID);

      const profileInfo = await userConn.getUserInfo();

      const user = await axios.get(
        `/api/get-wallet-data?wallet=${wallet?.publicKey.toBase58()}`
      );

      const username = user.data?.profile?.username;

      let profileLineage = profileInfo.profilelineage as ProfileLineage;

      console.log("===============================3");

      console.log("profileInfo", profileInfo);
      setProfileInfo({
        profileLineage,
        solBalance: profileInfo.solBalance,
        mmoshBalance: profileInfo.oposTokenBalance,
        usdcBalance: profileInfo.usdcTokenBalance,
        profile: {
          name: username,
          address: wallet?.publicKey.toBase58()!,
          image: user.data?.profile?.image,
        },
      });
    } catch (err) {
      console.error("Header error: ", err);
    }

    setIsLoadingProfile(false);
  };

  React.useEffect(() => {
    localStorage.setItem("isSpeek", JSON.stringify({ isSpeek: false }));
    if (!rendered.current) {
      init();
      rendered.current = true;
    }
    window.speechSynthesis.cancel();
  }, []);
  const checkMembershipStatus = async () => {
    const token = localStorage.getItem("token") || "";
    const membershipInfo = await axios.get(
      "/api/membership/has-membership?wallet=" + wallet!.publicKey.toBase58(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    setMembershipStatus(membershipInfo.data);
  };

  const fetchNotifications = async () => {
    try {
      const response = await internalClient.get(
        `/api/notifications?wallet=${wallet?.publicKey.toBase58()}`
      );
      setBadge(response.data.unread);
      setNotifications(response.data.data);
      console.log("NOTIFICATION LIST:", response.data);
    } catch (error) {
      setBadge(0);
      setNotifications([]);
    }
  };

  React.useEffect(() => {
    if (
      (!wallet || bags !== null) &&
      !["sign-up", "login", "password"].includes(pathname)
    )
      return;
    fetchAllBalances();
  }, [wallet]);
  React.useEffect(() => {
    if (wallet) {
      checkMembershipStatus();
      if (isInitialized) {
        trackPageView();
      }
    }
  }, [pathname, wallet]);

  React.useEffect(() => {
    if (wallet) {
      fetchNotifications();
      const intervalId = setInterval(() => {
        fetchNotifications();
      }, 60000);
      return () => clearInterval(intervalId);
    }
  }, [wallet]);

  React.useEffect(() => {
    if (
      wallet?.publicKey &&
      !renderedUserInfo.current &&
      !["sign-up", "login", "password"].includes(pathname)
    ) {
      renderedUserInfo.current = true;
      getProfileInfo();
    } else {
      setIsLoadingProfile(false);
    }
    checkIfIsAuthenticated();
    updateUserActivity();
  }, [wallet]);

  const updateUserActivity = async () => {
    await axios.put(
      "/api/update-user-activity",
      {
        wallet: wallet?.publicKey.toBase58(),
      },
      {
        headers: {
          authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      }
    );
  };

  const resetNotification = async () => {
    await internalClient.put("/api/notifications/update", {
      wallet: wallet?.publicKey.toBase58(),
    });
    setBadge(0);
  };

  const logout = async () => {
    if (isLoadingLogout) return;

    setIsLoadingLogout(true);
    await client.delete("/logout", {});
    window.localStorage.removeItem("token");
    setIsLoadingLogout(false);

    setIsUserAuthenticated(false);
    setShowAuthOverlay(true);
  };

  const isMobileScreen = screenSize < 1200;

  if (
    pathname.includes("sign-up") ||
    pathname.includes("login") ||
    pathname.includes("password") ||
    pathname.includes("account")
  ) {
    return <></>;
  }

  if (
    pathname === "/tos" ||
    pathname === "/privacy" ||
    pathname === "/copyright" ||
    pathname === "/license" ||
    pathname === "/" ||
    (pathname === "/preview" && !isUserAuthenticated)
  ) {
    return <></>;
  }

  return (
    <>
      <AlertModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialStep={initialModalStep}
        isHome={pathname === "/"}
      />
      <header className="flex flex-col bg-transparent">
        <div className="w-full flex flex-col justify-center items-center py-6 md:px-20 px-8 relative">
          <div className="flex w-full justify-between items-center mx-8">
            {isMobileScreen ? (
              <div className="w-[100%] flex items-center">
                <MobileDrawer />

                <div className="mx-2" />

                <KinshipBots width={150} />
              </div>
            ) : (
              <div
                className="flex justify-start w-[100%] mr-12 cursor-pointer"
                onClick={() => {
                  if (pathname === "/" && isUserAuthenticated) {
                    setIsUserAuthenticated(false);
                    return;
                  }
                  router.push("/");
                }}
              >
                <KinshipBots />
              </div>
            )}

            {!isMobileScreen && isUserAuthenticated && <Tabs />}

            {!isUserAuthenticated &&
              pathname.includes("/bots/") &&
              !isMobileScreen && (
                <div className={`relative w-[100%] h-[80px]`}>
                  <Image
                    src="https://storage.googleapis.com/mmosh-assets/home/fd_logo.png"
                    alt="logo"
                    className="object-contain"
                    layout="fill"
                  />
                </div>
              )}

            <div className={`flex items-center justify-end w-[100%]`}>
              {!!currentUser?.profile?.image && isUserAuthenticated && (
                <>
                  <div
                    className={`relative w-[3.5vmax] md:w-[2.5vmax] h-[2.5vmax] md:mr-4 md:ml-4 ${
                      isDrawerShown ? "z-[-1]" : ""
                    } cursor-pointer`}
                    onClick={() => {
                      router.push(`/${currentUser?.profile.username}`);
                    }}
                  >
                    <Image
                      src={currentUser.profile.image}
                      alt="Profile Image"
                      className="rounded-md"
                      layout="fill"
                    />
                  </div>
                  <div className="dropdown dropdown-bottom dropdown-left">
                    <a
                      className="relative text-base text-white cursor-pointer"
                      tabIndex={0}
                      href="#"
                      onClick={resetNotification}
                    >
                      {/* Notification Icon */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="30"
                        height="30"
                        viewBox="0 0 20 20"
                        className="transition-transform duration-200 hover:scale-110"
                      >
                        <path
                          fill="#fff"
                          fillRule="evenodd"
                          d="M3.909 1.53a4.372 4.372 0 0 1 7.463 3.092c0 .543.088 1.062.23 1.613q.054.168.117.316c.057.133.172.248.392.39c.086.054.174.105.274.162l.093.054c.134.077.283.167.426.273c.518.383.708.973.682 1.505c-.025.517-.257 1.057-.69 1.383a1 1 0 0 1-.087.06a2 2 0 0 1-.226.125a5 5 0 0 1-.928.318c-.87.22-2.311.429-4.655.429s-3.785-.209-4.655-.429a5 5 0 0 1-.928-.318a2 2 0 0 1-.293-.17l-.02-.015C.671 9.992.44 9.452.414 8.935c-.026-.532.164-1.122.682-1.505l.297.401l-.297-.401a5 5 0 0 1 .426-.273l.093-.054c.1-.057.188-.108.274-.163c.22-.14.335-.256.391-.389c.203-.476.348-1.104.348-1.93c0-1.159.461-2.27 1.28-3.09m1.93 10.455a.5.5 0 0 0-.602.71a2 2 0 0 0 3.526 0a.5.5 0 0 0-.601-.71c-.254.086-.628.152-1.162.152s-.908-.066-1.162-.152"
                          clipRule="evenodd"
                        />
                      </svg>

                      {/* Notification Badge */}
                      {badge > 0 && (
                        <span className="absolute right-[-6px] top-[-8px] flex items-center justify-center bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5">
                          {badge}
                        </span>
                      )}
                    </a>

                    {notifications && (
                      <div className="dropdown-content mt-3 z-[50]">
                        <div className="menu bg-[#030007cc] backdrop-blur-xl rounded-xl shadow-xl p-3 w-[60vw] sm:w-70 md:w-[25rem] max-h-[60vh] overflow-y-auto border border-white/10">
                          {notifications.length > 0 ? (
                            <div className="space-y-2">
                              {notifications.map((value: any) => (
                                <Notification data={value} key={value._id} />
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-300 text-center py-4">
                              You don't have any notifications
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!!currentUser &&
                !currentUser?.profile?.image &&
                isUserAuthenticated && (
                  <div
                    className={`relative w-[3.5vmax] md:w-[2.5vmax] md:h-[2.5vmax] h-[3.5vmax] md:mr-4 md:ml-4 ${
                      isDrawerShown ? "z-[-1]" : ""
                    } cursor-pointer`}
                    onClick={() => {
                      if (
                        !!currentUser?.guest_data.username &&
                        currentUser?.guest_data.username !== ""
                      ) {
                        router.push(`/${currentUser?.guest_data.username}`);
                      }
                    }}
                  >
                    <Image
                      src={
                        !!currentUser?.guest_data?.picture
                          ? currentUser!.guest_data.picture
                          : "https://storage.googleapis.com/mmosh-assets/default.png"
                      }
                      alt="Profile Image"
                      className="rounded-md"
                      layout="fill"
                    />
                  </div>
                )}

              {!isMobileScreen && isUserAuthenticated && (
                <button
                  className="relative border-[#FFFFFF47] border-[1px] bg-[#FFFFFF0F] px-4 py-2 rounded-full ml-4"
                  onClick={() => router.push("/settings")}
                >
                  <p className="lg:text-base text-xs text-white">Settings</p>
                </button>
              )}

              {!isUserAuthenticated && (
                <button
                  className="relative border-[#FFFFFF47] border-[1px] bg-[#FFFFFF0F] px-4 py-2 rounded-full ml-4"
                  onClick={() => {
                    if (pathname.includes("/bots/")) {
                      setIsModalOpen(true);
                      setInitialModalStep(0);
                      return;
                    }

                    router.push("/sign-up");
                  }}
                >
                  <p className="text-white lg:text-base text-xs text-center">
                    Sign Up
                  </p>
                </button>
              )}

              <button
                className="relative bg-[#CD068E] px-4 py-2 rounded-full ml-4"
                disabled={isLoadingLogout}
                onClick={() => {
                  if (isUserAuthenticated) {
                    logout();
                    return;
                  }

                  if (pathname.includes("/bots/")) {
                    setIsModalOpen(true);
                    setInitialModalStep(2);
                    return;
                  }

                  router.push("/login");
                }}
              >
                {isLoadingLogout ? (
                  <span className="loading loading-spinner loading-lg bg-[#CD068E]"></span>
                ) : (
                  <p className="lg:text-base text-xs text-white">
                    {isUserAuthenticated ? "Logout" : "Log In"}
                  </p>
                )}
              </button>
            </div>
          </div>
        </div>

        {pathname.includes("/bots/") && (
          <MessageBanner
            type="info"
            message="Welcome to Full Disclosure NOW! You are cordially invited to participate in the beta test of our AI Bot. This is a pre-release system for test purposes only, so please excuse any issues you may encounter."
          />
        )}

        {pathname.includes("/communities/") && community !== null && (
          <div
            className={`self-center lg:max-w-[50%] relative  flex justify-center items-end mt-12 pb-4 ${
              isDrawerShown ? "z-[-1]" : "z-0"
            }`}
          >
            <div
              className={`flex flex-col justify-center items-center ${
                isDrawerShown && "z-[-1]"
              } py-20`}
            >
              <h2 className="text-center">{community.name}</h2>

              <p className="text-base my-4">{community.description}</p>
            </div>
          </div>
        )}
        {membershipStatus === "expired" && (
          <div
            className="cursor-pointer"
            onClick={() => {
              router.push(`/settings?membershipStatus=${membershipStatus}`);
            }}
          >
            <MessageBanner
              type="error"
              message="Your membership is expired. pls upgrade"
            />
          </div>
        )}
      </header>
    </>
  );
};

export default Header;
