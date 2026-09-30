import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

import { posts } from '../../content/posts';
import type { Route } from './+types/index';

export const meta: Route.MetaFunction = () => [{ title: 'Blog · Tried Gold' }];

export const loader = () => ({
  posts: posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    date: post.date,
    excerpt: post.excerpt,
  })),
});

export default function Blog(props: Route.ComponentProps) {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-semibold text-ink">Blog</h1>

      <div className="space-y-10">
        {props.loaderData.posts.map((post) => (
          <article key={post.slug} className="space-y-2 border-b border-rule pb-8">
            <div className="text-sm text-muted">{post.date}</div>
            <h2 className="text-3xl font-semibold text-ink">
              <Link to={`/blog/${post.slug}`} className="hover:text-accent hover:underline">
                {post.title}
              </Link>
            </h2>
            <p className="mt-2">{post.excerpt}</p>
            <div className="pt-4">
              <Link
                to={`/blog/${post.slug}`}
                className="inline-flex items-center text-ink hover:text-accent hover:underline"
              >
                Read more <ArrowRight className="ml-1 size-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
