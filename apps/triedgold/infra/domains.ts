/**
 * triedgold.com in production: the Railway custom domains and the Cloudflare
 * DNS records that point them at Railway. Only the `prod` stage yields these;
 * throwaway stages serve their generated `*.up.railway.app` URL.
 *
 * - The zone moved from name.com to Cloudflare. The stack adopts it and never
 *   changes or deletes it (retain). Records it does not declare (the ImprovMX
 *   MX and SPF records for mail) are left alone.
 * - Each hostname (the apex and `www`) is a Railway custom domain plus the
 *   CNAME Railway asks for: the domain's `TRAFFIC_ROUTE` record, whose value
 *   (`<id>.up.railway.app`) Railway assigns per domain. The value is read from
 *   Railway after the domain exists, never copied by hand. At the apex,
 *   Cloudflare flattens the CNAME.
 * - The records are DNS-only (`proxied: false`). Railway terminates TLS and
 *   issues each hostname's Let's Encrypt certificate itself, which needs the
 *   hostname to resolve to Railway's edge. Behind Cloudflare's proxy the
 *   challenge and Railway's DNS check see Cloudflare's addresses instead, and
 *   the site would depend on the zone's SSL mode (Flexible loops forever).
 * - An existing record with the same name and type is adopted and brought to
 *   the declared value. The apex record Cloudflare imported from name.com is
 *   an `A` record (66.33.22.4, proxied), not a CNAME, and Cloudflare refuses a
 *   CNAME beside an `A` of the same name. It is deleted by hand once, right
 *   before the first prod deploy (the go-live steps in the handoff).
 */
import { Query } from '@distilled.cloud/core/query';
import { Railway } from '@distilled.cloud/railway';
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Output from 'alchemy/Output';
import { CustomDomain } from 'alchemy/Railway/CustomDomain';
import { Array as Arr, Effect, Option } from 'effect';

import type Server from '../src/deploy/Server.ts';
import { DOMAIN, PORT, TriedGold } from './railway.ts';

/** The deployed site service, as the stack yields it. */
type Site = Effect.Success<typeof Server>;

/** The hostnames production answers on, keyed by their logical id. */
export const HOSTS = { Apex: DOMAIN, Www: `www.${DOMAIN}` } as const;

/** The records Railway lists for one custom domain. */
const dnsRecords = Query.fn((id: string, projectId: string) =>
  Railway.customDomain({ id, projectId }).status.dnsRecords.pipe(
    Query.map((record) => ({
      recordType: record.recordType,
      purpose: record.purpose,
      requiredValue: record.requiredValue,
    })),
  ),
);

/**
 * The CNAME target Railway requires for a custom domain. A domain without one
 * is a Railway change this stack does not understand, so the plan stops.
 */
const trafficTarget = (domain: { customDomainId: string; projectId: string; domain: string }) =>
  dnsRecords(domain.customDomainId, domain.projectId).pipe(
    Effect.map((records) =>
      Arr.findFirst(
        records,
        (record) =>
          record.purpose === 'DNS_RECORD_PURPOSE_TRAFFIC_ROUTE' &&
          record.recordType === 'DNS_RECORD_TYPE_CNAME' &&
          record.requiredValue.length > 0,
      ),
    ),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.die(new Error(`Railway lists no CNAME target for ${domain.domain}`)),
        onSome: (route) => Effect.succeed(route.requiredValue),
      }),
    ),
    Effect.orDie,
  );

/** One hostname: its Railway custom domain and the DNS record Railway asks for. */
const host = Effect.fn('TriedGold.host')(function* (
  id: keyof typeof HOSTS,
  zoneId: Output.Output<string>,
  service: Site,
) {
  const name = HOSTS[id];
  // Found by hostname on the service, so an existing domain is adopted.
  const domain = yield* CustomDomain(`${id}Domain`, {
    service,
    environment: TriedGold,
    domain: name,
    targetPort: PORT,
  });
  yield* Cloudflare.DNS.Record(`${id}Record`, {
    zoneId,
    name,
    type: 'CNAME',
    content: Output.all(domain.customDomainId, domain.projectId).pipe(
      Output.mapEffect(([customDomainId, projectId]) =>
        trafficTarget({ customDomainId, projectId, domain: name }),
      ),
    ),
    proxied: false,
    comment: 'Railway custom domain (alchemy: apps/triedgold)',
  });
  return domain;
});

/** Production's domains and DNS, adopted and retained. */
export const Domains = Effect.fn('TriedGold.domains')(
  function* (service: Site) {
    const zone = yield* Cloudflare.Zone.Zone('Zone', { name: DOMAIN }).pipe(
      Alchemy.RemovalPolicy.retain(),
    );
    const apex = yield* host('Apex', zone.zoneId, service);
    const www = yield* host('Www', zone.zoneId, service);
    return { apex, www };
  },
  Alchemy.AdoptPolicy.adopt(true),
  Alchemy.RemovalPolicy.retain(),
);
