import type { Metadata } from "next";
import "../../globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Kinship Codes",
    description: "It’s All Related",
    openGraph: {
      images: ["https://storage.googleapis.com/mmosh-assets/kinship_codes.png"],
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="h-full">{children}</div>;
}
