/**
 * The list's two letters, each as plain text and as simple HTML in the
 * site's colours: the one that asks an address to confirm, and the one a
 * film sends when it is out. The HTML is a page of text and links: no
 * image, no font or style from anywhere else, no pixel and no tracked link.
 * A film's letter carries `List-Unsubscribe` and `List-Unsubscribe-Post`
 * (RFC 2369 and RFC 8058), so a mail app can offer to leave in one press,
 * and the same link is at its foot.
 *
 * Links are built on `origin`, the site the request came to, so a copy on a
 * throwaway stage sends links to itself.
 */
import { CHANNEL } from '../site.ts';
import { UNITS } from '../content.ts';
import { PALETTE } from '../palette.ts';
import type { Address } from './address.ts';
import type { Film } from './films.ts';
import type { Letter } from './mailer.ts';

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const FONT = "Georgia, 'Times New Roman', serif";

/** A paragraph of the HTML letter; its words are escaped here. */
const para = (text: string, style = '') =>
  `<p style="margin:0 0 16px;${style}">${escape(text)}</p>`;

const link = (href: string, words: string) =>
  `<a href="${escape(href)}" style="color:${PALETTE.accent};">${escape(words)}</a>`;

/** A link drawn as the site's pill. */
const button = (href: string, words: string) =>
  `<p style="margin:24px 0;"><a href="${escape(href)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:${PALETTE.ink};color:${PALETTE.paper};text-decoration:none;font-weight:600;">${escape(words)}</a></p>`;

/** The page every HTML letter is laid on: the site's paper, its ink, one column. */
const page = (title: string, body: string) =>
  [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title></head>`,
    `<body style="margin:0;padding:0;background:${PALETTE.paper};">`,
    `<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:${FONT};font-size:17px;line-height:1.55;color:${PALETTE.ink};">`,
    body,
    '</div></body></html>',
  ].join('');

const signOff = (origin: string) => [CHANNEL.name, origin.replace(/^https?:\/\//, '')];

export const confirmLink = (origin: string, token: string) =>
  `${origin}/subscribe/confirm?token=${encodeURIComponent(token)}`;

export const unsubscribeLink = (origin: string, token: string) =>
  `${origin}/unsubscribe?token=${encodeURIComponent(token)}`;

/** The letter that asks an address to confirm it wants the films. */
export const confirmLetter = (to: Address, origin: string, token: string): Letter => {
  const href = confirmLink(origin, token);
  const subject = `Confirm your email for ${CHANNEL.name}`;
  const ask = `Someone, we hope you, asked for one email from ${CHANNEL.name} each time a new film is out. To confirm, open this link:`;
  const after =
    'The link works for seven days. If you did not ask, you need do nothing: no film will be sent to this address unless the link is opened.';
  const text = ['Hello,', '', ask, '', href, '', after, '', ...signOff(origin), ''].join('\n');
  const html = page(
    subject,
    [
      para('Hello,'),
      para(
        `Someone, we hope you, asked for one email from ${CHANNEL.name} each time a new film is out.`,
      ),
      button(href, 'Confirm my email'),
      para(after),
      `<p style="margin:24px 0 0;color:${PALETTE.soft};">${escape(CHANNEL.name)}<br>${link(origin, signOff(origin)[1] ?? origin)}</p>`,
    ].join(''),
  );
  return { to, subject, text, html, headers: {} };
};

const watchUrl = (film: Film) => `https://www.youtube.com/watch?v=${film.episode.youtubeId}`;

/** The letter a film sends to each subscriber when it is out. */
export const filmLetter = (to: Address, origin: string, film: Film, token: string): Letter => {
  const { series, episode } = film;
  const unit = UNITS[series.form].one;
  const leave = unsubscribeLink(origin, token);
  const seriesUrl = `${origin}/series/${series.slug}`;
  const subject = `A new ${unit}: ${episode.title}`;
  const lead = `A new ${unit} is out in ${series.name}:`;
  const heading = `${episode.no} · ${episode.title}`;
  const why = `You are on the ${CHANNEL.name} list: one email for each new film.`;
  const text = [
    lead,
    '',
    heading,
    '',
    episode.summary,
    '',
    'Watch it on YouTube:',
    watchUrl(film),
    '',
    `The series: ${seriesUrl}`,
    '',
    ...signOff(origin),
    '',
    `${why} To leave the list: ${leave}`,
    '',
  ].join('\n');
  const html = page(
    subject,
    [
      para(lead, `color:${PALETTE.soft};`),
      `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:600;">${escape(heading)}</h1>`,
      para(episode.summary),
      button(watchUrl(film), 'Watch it on YouTube'),
      `<p style="margin:0 0 16px;">The series: ${link(seriesUrl, series.name)}</p>`,
      `<p style="margin:32px 0 0;font-size:14px;color:${PALETTE.soft};">${escape(why)} ${link(leave, 'Leave the list')}</p>`,
    ].join(''),
  );
  return {
    to,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${leave}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
};
