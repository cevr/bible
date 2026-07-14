import type { ClassifiedCrossReference, CrossRefType } from '@bible/core/bible-cross-refs';

export type PopupPage = 'crossrefs' | 'commentary' | 'structure';

export const POPUP_PAGES: readonly PopupPage[] = ['crossrefs', 'commentary', 'structure'];

export interface CrossRefPreview {
  readonly ref: ClassifiedCrossReference;
  readonly preview: string;
}

export const TYPE_BADGES: Readonly<Record<CrossRefType, { label: string; color: string }>> = {
  quotation: { label: 'QUO', color: '#e06c75' },
  allusion: { label: 'ALL', color: '#c678dd' },
  parallel: { label: 'PAR', color: '#61afef' },
  typological: { label: 'TYP', color: '#e5c07b' },
  prophecy: { label: 'PRO', color: '#d19a66' },
  sanctuary: { label: 'SAN', color: '#56b6c2' },
  recapitulation: { label: 'REC', color: '#98c379' },
  thematic: { label: 'THM', color: '#abb2bf' },
};
