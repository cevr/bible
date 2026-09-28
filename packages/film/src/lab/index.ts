// The film lab's page (`/lab?film=<film>`, `film lab`): the preview player
// with the lab's panels in Solid 2 around it. The player page, which the
// renderer loads, never imports this module.

export { LabPage, LabStartFailed, mountLab } from './mount.tsx';
export { Lab, useLab } from './shell.tsx';
export type { LabActions, LabContextValue, LabMeta, LabState } from './shell.tsx';
