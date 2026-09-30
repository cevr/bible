import { ArrowLeft } from 'lucide-react';
import { Option } from 'effect';
import { data, Link } from 'react-router';

import { findPost } from '../../content/posts';
import type { Route } from './+types/post';

// A missing post throws React Router's 404 response, which renders the root
// ErrorBoundary with that status: the loader protocol's way to answer 404.
export const loader = (args: Route.LoaderArgs) => ({
  post: Option.getOrThrowWith(findPost(args.params.slug), () => data('Not Found', { status: 404 })),
});

export const meta: Route.MetaFunction = (args) => [
  { title: `${args.loaderData?.post.title ?? 'Not Found'} · Tried Gold` },
];

export default function BlogPost(props: Route.ComponentProps) {
  const { post } = props.loaderData;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <Link
          to="/blog"
          className="inline-flex items-center text-ink hover:text-accent hover:underline"
        >
          <ArrowLeft className="mr-1 size-4" aria-hidden="true" /> Back to all posts
        </Link>
      </div>

      <article className="prose prose-lg max-w-none text-ink prose-headings:text-ink prose-strong:text-ink">
        <header className="mb-8">
          <div className="mb-2 text-sm text-muted">{post.date}</div>
          <h1 className="font-semibold text-ink">{post.title}</h1>
        </header>

        <div dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </div>
  );
}
