// `@bible/film/style`: the house look, as a film reads it. A scene acts a face
// (`acted` from `EASE` toward an `Expression`), runs the paper's boil
// (`boilTime`), reaches a hand about a point (`reachAbout`), eases
// (`smooth`), and shades a paper of its own under the house's key light
// (`keyLight`, `shading`, with `ramp` from `@bible/film/canvas`). The rigs
// are written on `@bible/film/style/rig`, and built by
// `@bible/film/style/build`.

export { EASE, type Expression, acted } from './face.ts';
export { keyLight, shading } from './house.ts';
export { type Pt, boilTime, reachAbout, smooth } from './rig/parts.ts';
