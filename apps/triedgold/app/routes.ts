import { index, prefix, route, type RouteConfig } from '@react-router/dev/routes';

// The old site's URLs, unchanged, except `/events`: its listings were the old
// site's sample data (2025 dates, "Anytown", dead Register links), so the page
// is hidden and the URL answers the site's 404 page. The route and its data sit
// in `archive/events/`, outside the build; moving them back restores the page.
export default [
  index('routes/home.tsx'),
  route('about', 'routes/about.tsx'),
  route('contact', 'routes/contact.tsx'),
  ...prefix('blog', [index('routes/blog/index.tsx'), route(':slug', 'routes/blog/post.tsx')]),
] satisfies RouteConfig;
