import Link from "next/link";
import Image from "next/image";
import { getPayload } from "payload";
import config from "@payload-config";
import PageHeader from "@/app/(main)/components/PageHeader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nightpapers",
  description: "Latest posts and updates",
};

export default async function BlogPage() {
  const payload = await getPayload({ config });

  const { docs: posts } = await payload.find({
    collection: "posts",
    draft: false,
    sort: "-publishedAt",
    depth: 1,
  });

  return (
    <div className="background-content flex flex-col">
      <PageHeader />
      <div className="w-full flex flex-col items-center px-6 md:px-12 pt-32 pb-16">
        <h1 className="text-3xl font-bold mb-12">Nightpapers</h1>

        {posts.length === 0 && (
          <p className="text-gray-400">No posts published yet.</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
          {posts.map((post) => {
            const image =
              post.featuredImage && typeof post.featuredImage === "object"
                ? post.featuredImage
                : null;

            return (
              <Link
                key={post.id}
                href={`/nightpapers/${post.slug}`}
                className="flex flex-col rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-colors bg-white/5"
              >
                {image?.url && (
                  <div className="relative w-full h-48">
                    <Image
                      src={image.url}
                      alt={image.alt || post.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2 p-5">
                  <h2 className="text-lg font-semibold line-clamp-2">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-gray-400 line-clamp-3">
                      {post.excerpt}
                    </p>
                  )}
                  {post.publishedAt && (
                    <span className="text-xs text-gray-500 mt-auto pt-2">
                      {new Date(post.publishedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
