import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";
import config from "@payload-config";
import type { Metadata } from "next";
import PageHeader from "@/app/(main)/components/PageHeader";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getPayload({ config });

  const { docs } = await payload.find({
    collection: "posts",
    where: { slug: { equals: slug } },
    draft: false,
    limit: 1,
    depth: 0,
  });

  const post = docs[0];
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt ?? undefined,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const payload = await getPayload({ config });

  const { docs } = await payload.find({
    collection: "posts",
    where: { slug: { equals: slug } },
    draft: false,
    limit: 1,
    depth: 1,
  });

  const post = docs[0];
  if (!post) notFound();

  const image =
    post.featuredImage && typeof post.featuredImage === "object"
      ? post.featuredImage
      : null;

  const author =
    post.author && typeof post.author === "object" ? post.author : null;

  const contentHtml = post.content
    ? await convertLexicalToHTML({ data: post.content as any })
    : null;

  return (
    <div className="background-content flex flex-col">
      <PageHeader />
      <div className="w-full flex flex-col items-center px-6 md:px-12 pt-32 pb-16">
        <article className="w-full max-w-3xl flex flex-col gap-8">
          <Link
            href="/nightpapers"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← Back to Nightpapers
          </Link>

          {image?.url && (
            <div className="relative w-full h-72 rounded-xl overflow-hidden">
              <Image
                src={image.url}
                alt={image.alt || post.title}
                fill
                className="object-cover"
              />
            </div>
          )}

          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold">{post.title}</h1>

            <div className="flex items-center gap-4 text-sm text-gray-400">
              {author?.name && <span>{author.name}</span>}
              {post.publishedAt && (
                <span>
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>

            {post.excerpt && (
              <p className="text-gray-300 text-lg">{post.excerpt}</p>
            )}
          </div>

          {contentHtml && (
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          )}
        </article>
      </div>
    </div>
  );
}
