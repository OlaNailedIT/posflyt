import { Link, Navigate, useParams } from "react-router-dom";
import SeoHead from "../components/seo/SeoHead";
import TrackedLink from "../components/TrackedLink";
import { getPostBySlug } from "../content/blogPosts";

export default function BlogPostPage() {
  const { slug } = useParams();
  const post = slug ? getPostBySlug(slug) : null;

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  return (
    <>
      <SeoHead
        title={`${post.title} | POSflyt Blog`}
        description={post.excerpt}
        keywords={`${post.category}, POS, retail, SMB`}
        ogType="article"
      />
      <article className="mx-auto max-w-3xl px-4 py-14 md:py-20">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">{post.category}</p>
        <h1 className="mt-2 text-3xl font-black text-stone-900 md:text-4xl dark:text-stone-50">{post.title}</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-500">
          {post.date} · {post.readTime}
        </p>
        <div className="mt-8 space-y-4 text-stone-700 dark:text-stone-300">
          {post.body.map((para, i) => (
            <p key={i} className="leading-relaxed">
              {para}
            </p>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-teal-200 bg-teal-50/80 p-5 dark:border-teal-900 dark:bg-teal-950/30">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Ready to put this into practice?</p>
          <TrackedLink
            to={post.cta.to}
            eventName={post.cta.event}
            className="mt-3 inline-flex rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950"
          >
            {post.cta.label} →
          </TrackedLink>
        </div>
        <p className="mt-8">
          <Link to="/blog" className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400">
            ← All articles
          </Link>
        </p>
      </article>
    </>
  );
}
