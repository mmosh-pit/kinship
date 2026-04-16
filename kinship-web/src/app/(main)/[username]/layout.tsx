import type { Metadata } from "next";
import "../..//globals.css";
import { getUserDataForMetadata } from "@/app/(main)/lib/getUserDataForMetadata";

type Props = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // read route params
  const { username } = await params;

  if (!username) {
    return {
      title: "Kinship Codes",
      description: "It’s All Related",
      openGraph: {
        images: [
          "https://storage.googleapis.com/mmosh-assets/kinship_codes.png",
        ],
      },
    };
  }

  const user = await getUserDataForMetadata(username);

  if (!user) {
    return {
      title: "Kinship Codes",
      description: "It’s All Related",
      openGraph: {
        images: [
          "https://storage.googleapis.com/mmosh-assets/kinship_codes.png",
        ],
      },
    };
  }

  return {
    title: `MMOSH App ${user?.profile?.username} Hideout`,
    description: user?.profile?.bio,
    openGraph: {
      images: [
        user?.profile?.image ||
        "https://storage.googleapis.com/mmosh-assets/metadata_image.png",
      ],
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="h-full">{children}</div>;
}
