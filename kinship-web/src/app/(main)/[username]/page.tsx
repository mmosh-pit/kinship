"use client";;
import { use } from "react";

import Profile from "../components/Profile/Profile";

const Page = (props: { params: Promise<{ username: string }> }) => {
  const params = use(props.params);
  return <Profile username={params.username} />;
};

export default Page;
