// Upstream: packages/react/src/tooltip/index.ts
//
// The tooltip: `Tooltip.Provider`, `Tooltip.Root`, `Tooltip.Trigger`,
// `Tooltip.Portal`, `Tooltip.Positioner`, `Tooltip.Popup`, `Tooltip.Arrow`,
// and the parts' types.
export * as Tooltip from './index.parts.ts';

export type * from './arrow/TooltipArrow.tsx';
export type * from './popup/TooltipPopup.tsx';
export type * from './portal/TooltipPortal.tsx';
export type * from './positioner/TooltipPositioner.tsx';
export type * from './provider/TooltipProvider.tsx';
export type * from './root/TooltipRoot.tsx';
export type * from './trigger/TooltipTrigger.tsx';
