import { Bookmark } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Route } from './+types/about';

export const meta: Route.MetaFunction = () => [{ title: 'About · Tried Gold' }];

function Section(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 flex items-center text-2xl font-semibold text-ink">
        <Bookmark className="mr-2 size-5 text-gold" aria-hidden="true" />
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

export default function About() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-semibold text-ink">About</h1>

      <div className="space-y-6">
        <Section title="Our Name">
          <p>
            Our name is inspired by Revelation 3:18, which speaks of "gold tried in the fire" -
            symbolizing the purest, most resilient forms of faith and love.
          </p>
        </Section>

        <Section title="Our Mission">
          <ol className="list-decimal space-y-4 pl-6 font-semibold">
            <li>
              Explore timeless truths from biblical teachings and their relevance in today's world
            </li>
            <li>Prepare individuals for navigating uncertain times and societal changes</li>
            <li>Foster personal growth that reflects compassion, integrity, and resilience</li>
          </ol>
        </Section>

        <Section title="Our Approach">
          <div className="space-y-4">
            <p>
              At Tried Gold, we believe that regardless of one's background or beliefs, there's
              value in understanding the moral and practical insights offered by biblical
              narratives. Our programs blend spiritual teachings with practical life skills, aiming
              to equip people with tools for ethical decision-making, building strong communities,
              and finding purpose in a rapidly changing world.
            </p>
            <p>
              We invite you to join us in this journey of discovery and growth. Whether you're
              seeking spiritual depth, practical wisdom, or a supportive community, Tried Gold
              offers a space for learning and transformation as we face the future together.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
