import { Link } from "react-router-dom";
import SeoHead from "../components/seo/SeoHead";
import { BLOG_POSTS } from "../content/blogPosts";

export default function BlogIndex() {
  return (
    <>
      <SeoHead
        title="POSflyt Blog — Retail Ops, POS & Growth"
        description="Best practices for offline POS, inventory accuracy, reporting that drives revenue, and SMB growth—plus product updates."
        keywords="POS blog, retail operations, offline POS tips, SMB growth"
      />
      <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        <h1 className="text-4xl font-black text-stone-900 dark:text-stone-50">Insights for operators</h1>
        <p className="mt-3 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
          Practical guides and industry notes. Every article ends with a clear next step—trial, pricing, or a feature deep-dive.
        </p>
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {BLOG_POSTS.map((post) => (
            <li key={post.slug}>
              <article className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">{post.category}</p>
                <h2 className="mt-2 text-xl font-bold text-stone-900 dark:text-stone-100">
                  <Link to={`/blog/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-2 flex-1 text-sm text-stone-600 dark:text-stone-400">{post.excerpt}</p>
                <p className="mt-4 text-xs text-stone-500 dark:text-stone-500">
                  {post.date} · {post.readTime}
                </p>
                <Link
                  to={`/blog/${post.slug}`}
                  className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline dark:text-teal-400"
                >
                  Read article →
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
