// The renderer's probes: one short graph per node kind and per branch of each
// (every wave, colour, set of modes, filter, drive, timing, curve and draw),
// each rendered at its seed and pinned by the sha256 of its Float32 samples.
// `RENDER_VERSION` is the first 8 hex of the sha256 of these pins, so a DSP
// edit that moves one sample of one probe moves the version, and with it the
// key of every code sound's render and mix.

import type { CodeSound, Node } from '../nodes.ts';

/** A probe: a sound, the seed it renders with (1 when absent), and the code sounds it samples. */
export interface Probe {
  readonly name: string;
  readonly sound: CodeSound;
  readonly seed?: number;
  readonly samples?: Readonly<Record<string, CodeSound>>;
}

/** A short click: white noise under a falling line. */
const tick: Node = {
  _tag: 'Envelope',
  points: [
    [0, 1],
    [0.01, 0],
  ],
  curve: 'linear',
  of: { _tag: 'Noise', color: 'white', secs: 0.012 },
};

const white = (secs: number): Node => ({ _tag: 'Noise', color: 'white', secs });

const sine = (pitch: string, secs: number): Node => ({
  _tag: 'Osc',
  wave: 'sine',
  pitch,
  secs,
  phase: 0,
});

const filtered = (
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass',
  q: number,
): Node => ({
  _tag: 'Filter',
  type,
  hz: 1000,
  q,
  of: white(0.1),
});

const shelved = (type: 'peak' | 'lowshelf' | 'highshelf', hz: number, db: number): Node => ({
  _tag: 'Filter',
  type,
  hz,
  q: 0.707,
  db,
  of: white(0.1),
});

const driven = (transfer: 'tanh' | 'soft' | 'hard' | 'fold'): Node => ({
  _tag: 'Drive',
  db: 12,
  transfer,
  of: sine('A2', 0.05),
});

const enveloped = (curve: 'linear' | 'exponential' | 'smooth'): Node => ({
  _tag: 'Envelope',
  points: [
    [0, 0],
    [0.01, 1],
    [0.08, 0],
  ],
  curve,
  of: sine('E4', 0.1),
});

const triad = (by: 'seed' | 'chance'): Node => ({
  _tag: 'Osc',
  wave: 'sine',
  pitch: { _tag: 'Pick', of: ['C4', 'E4', 'G4'], by },
  secs: 0.05,
  phase: 0,
});

const play = (node: Node): CodeSound => ({ play: node });

const TICKS = { 'probe.tick': play(tick) };

export const PROBES: ReadonlyArray<Probe> = [
  // Sources.
  { name: 'osc.sine', sound: play({ _tag: 'Osc', wave: 'sine', pitch: 'A4', secs: 0.1 }) },
  {
    name: 'osc.triangle',
    sound: play({
      _tag: 'Osc',
      wave: 'triangle',
      pitch: { _tag: 'Ramp', from: 220, to: 880, curve: 'exponential' },
      secs: 0.1,
      phase: 0,
    }),
  },
  {
    name: 'osc.saw',
    sound: play({
      _tag: 'Osc',
      wave: 'saw',
      pitch: { _tag: 'Wobble', around: 110, depth: 2, rate: 6 },
      secs: 0.1,
    }),
  },
  {
    name: 'osc.square',
    sound: play({
      _tag: 'Osc',
      wave: 'square',
      pitch: 'C3',
      duty: { _tag: 'Lfo', around: 0.5, depth: 0.3, rate: 10, wave: 'sine' },
      secs: 0.1,
    }),
  },
  { name: 'noise.white', sound: play(white(0.1)) },
  { name: 'noise.pink', sound: play({ _tag: 'Noise', color: 'pink', secs: 0.1 }) },
  { name: 'noise.brown', sound: play({ _tag: 'Noise', color: 'brown', secs: 0.1 }) },
  {
    name: 'partials.glass',
    sound: play({ _tag: 'Partials', pitch: 'D5', set: 'glass', secs: 0.2 }),
  },
  {
    name: 'partials.bell',
    sound: {
      key: { tonic: 'G', scale: 'majorPentatonic' },
      play: {
        _tag: 'Partials',
        pitch: { degree: 2, octave: 4 },
        set: 'bell',
        decayScale: 0.5,
        secs: 0.2,
      },
    },
  },
  {
    name: 'partials.modes',
    sound: play({
      _tag: 'Partials',
      pitch: { _tag: 'Vary', min: 200, max: 400, curve: 'log' },
      set: [
        { ratio: 1, level: 1, decay: 0.05 },
        { ratio: 2.76, level: 0.5, decay: 0.02 },
      ],
      attack: 0.002,
      secs: 0.1,
    }),
  },
  {
    name: 'sample.seeded',
    sound: play({ _tag: 'Sample', sound: 'probe.tick', seed: 3 }),
    samples: TICKS,
  },
  {
    name: 'sample.drawn',
    sound: play({ _tag: 'Sample', sound: 'probe.tick' }),
    samples: TICKS,
  },
  // Shapers.
  { name: 'gain.held', sound: play({ _tag: 'Gain', db: -6, of: sine('A3', 0.05) }) },
  {
    name: 'gain.ramp',
    sound: play({
      _tag: 'Gain',
      db: { _tag: 'Ramp', from: -40, to: 0, curve: 'linear' },
      of: white(0.05),
    }),
  },
  {
    name: 'gain.lfo',
    sound: play({
      _tag: 'Gain',
      db: { _tag: 'Lfo', around: -6, depth: 6, rate: 20, wave: 'triangle' },
      of: sine('A4', 0.1),
    }),
  },
  { name: 'envelope.linear', sound: play(enveloped('linear')) },
  { name: 'envelope.exponential', sound: play(enveloped('exponential')) },
  { name: 'envelope.smooth', sound: play(enveloped('smooth')) },
  {
    name: 'fade',
    sound: play({
      _tag: 'Fade',
      in: 0.01,
      out: 0.03,
      of: { _tag: 'Osc', wave: 'saw', pitch: 'G2', secs: 0.1, phase: 0 },
    }),
  },
  { name: 'drive.tanh', sound: play(driven('tanh')) },
  { name: 'drive.soft', sound: play(driven('soft')) },
  { name: 'drive.hard', sound: play(driven('hard')) },
  { name: 'drive.fold', sound: play(driven('fold')) },
  {
    name: 'drive.ramp',
    sound: play({
      _tag: 'Drive',
      db: { _tag: 'Ramp', from: 0, to: 24, curve: 'linear' },
      transfer: 'tanh',
      of: sine('A2', 0.05),
    }),
  },
  { name: 'crush.bits', sound: play({ _tag: 'Crush', bits: 4, of: sine('A3', 0.05) }) },
  {
    name: 'crush.hold',
    sound: play({
      _tag: 'Crush',
      hz: { _tag: 'Ramp', from: 8000, to: 1000, curve: 'exponential' },
      of: white(0.05),
    }),
  },
  {
    name: 'resample.up',
    sound: play({
      _tag: 'Resample',
      semitones: 12,
      of: { _tag: 'Partials', pitch: 'A4', set: 'glass', secs: 0.1 },
    }),
  },
  {
    name: 'resample.down',
    sound: play({
      _tag: 'Resample',
      semitones: -7,
      of: { _tag: 'Partials', pitch: 'A4', set: 'glass', secs: 0.1 },
    }),
  },
  // The filter, each type.
  { name: 'filter.lowpass', sound: play(filtered('lowpass', 0.707)) },
  { name: 'filter.highpass', sound: play(filtered('highpass', 0.707)) },
  { name: 'filter.bandpass', sound: play(filtered('bandpass', 4)) },
  { name: 'filter.notch', sound: play(filtered('notch', 2)) },
  { name: 'filter.allpass', sound: play(filtered('allpass', 0.707)) },
  { name: 'filter.peak', sound: play(shelved('peak', 1000, 9)) },
  { name: 'filter.lowshelf', sound: play(shelved('lowshelf', 300, 9)) },
  { name: 'filter.highshelf', sound: play(shelved('highshelf', 3000, -9)) },
  {
    name: 'filter.moving',
    sound: play({
      _tag: 'Filter',
      type: 'lowpass',
      hz: { _tag: 'Ramp', from: 200, to: 6000, curve: 'smooth' },
      q: {
        _tag: 'Points',
        points: [
          [0, 0.7],
          [0.05, 8],
        ],
        curve: 'linear',
      },
      of: white(0.1),
    }),
  },
  // Space.
  {
    name: 'delay.held',
    sound: play({ _tag: 'Delay', secs: 0.013, feedback: 0.5, wet: 0.5, tail: 0.1, of: tick }),
  },
  {
    name: 'delay.lfo',
    sound: play({
      _tag: 'Delay',
      secs: { _tag: 'Lfo', around: 0.01, depth: 0.004, rate: 3, wave: 'sine' },
      feedback: 0.3,
      wet: 0.5,
      tail: 0.05,
      of: { _tag: 'Osc', wave: 'saw', pitch: 'A3', secs: 0.1, phase: 0 },
    }),
  },
  {
    name: 'reverb',
    sound: play({ _tag: 'Reverb', size: 0.7, damp: 4000, wet: 0.3, tail: 0.2, of: tick }),
  },
  {
    name: 'loop',
    sound: play({
      _tag: 'Loop',
      crossfade: 0.02,
      of: { _tag: 'Noise', color: 'pink', secs: 0.15 },
    }),
  },
  // Time.
  {
    name: 'layer',
    sound: play({
      _tag: 'Layer',
      of: [
        { node: sine('A4', 0.1) },
        { node: white(0.05), at: { _tag: 'Vary', min: 0.01, max: 0.04 }, db: -12 },
      ],
    }),
  },
  {
    name: 'layer.secs',
    sound: play({
      _tag: 'Layer',
      secs: 0.06,
      of: [
        { node: sine('A4', 0.1) },
        { node: white(0.05), at: 0.03, db: -12 },
        { node: white(0.05), at: 0.08 },
      ],
    }),
  },
  {
    name: 'sequence',
    sound: play({
      _tag: 'Sequence',
      of: [sine('C5', 0.03), sine('E5', 0.03), sine('G5', 0.03)],
      gap: { _tag: 'Vary', min: 0.005, max: 0.02 },
    }),
  },
  {
    name: 'repeat.count',
    sound: play({ _tag: 'Repeat', timing: { _tag: 'Count', every: 0.02, count: 5 }, of: tick }),
  },
  {
    name: 'repeat.during',
    sound: play({
      _tag: 'Repeat',
      timing: { _tag: 'During', every: 0.03, secs: 0.15 },
      of: { _tag: 'Partials', pitch: 'C6', set: 'glass', secs: 0.04 },
    }),
  },
  {
    name: 'repeat.poisson',
    sound: play({ _tag: 'Repeat', timing: { _tag: 'Poisson', rate: 40, secs: 0.2 }, of: tick }),
  },
  // Draws.
  { name: 'pick.seed.1', sound: play(triad('seed')) },
  { name: 'pick.seed.2', sound: play(triad('seed')), seed: 2 },
  { name: 'pick.seed.4', sound: play(triad('seed')), seed: 4 },
  { name: 'pick.chance', sound: play(triad('chance')) },
  {
    name: 'vary.linear',
    sound: play({
      _tag: 'Osc',
      wave: 'sine',
      pitch: 'A4',
      secs: { _tag: 'Vary', min: 0.03, max: 0.08 },
      phase: 0,
    }),
  },
  {
    name: 'vary.log',
    sound: play({
      _tag: 'Filter',
      type: 'bandpass',
      hz: { _tag: 'Vary', min: 300, max: 3000, curve: 'log' },
      q: 3,
      of: white(0.05),
    }),
  },
  {
    name: 'stream.named',
    sound: play({ _tag: 'Noise', color: 'white', secs: 0.05, stream: 'grain' }),
  },
  {
    name: 'degree.minor',
    sound: {
      key: { tonic: 'Eb', scale: 'minor' },
      play: { _tag: 'Osc', wave: 'sine', pitch: { degree: -1, octave: 4 }, secs: 0.05, phase: 0 },
    },
  },
  {
    name: 'silence',
    sound: play({ _tag: 'Envelope', points: [[0, 0]], curve: 'linear', of: white(0.05) }),
  },
];

/** Each probe's render pinned by its name: the sha256 of its Float32 samples. */
export const GOLDEN: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'osc.sine': '3e61195e75ffb4ed3aea51ca32bee97d99225bac13982a2772d0c862b1399edc',
    'osc.triangle': 'ed383132bbc6a5dc83e1f25096b5cd6daa535742996cf3893677b0d8dc938219',
    'osc.saw': '7c9a0ef28b609e731d2876f974c2fdb447bdc1588e42538adcc731fb0ecf7623',
    'osc.square': '242dc82041149df1dc9a07d60dffe1d5487a1cec39aa3ee7a6c03c4310cf3869',
    'noise.white': 'c2f832bc5ffce3dace3003d4a60d2d821f6b64933717f9296047f3de8ccedae3',
    'noise.pink': '13ede9058bab626c8523178966f73f238b1c239e2a5e010d2875d9c6a760eba1',
    'noise.brown': '4a944970367872fea84bfdfd0c45c8ef67bcd618ae489501eb82077774615926',
    'partials.glass': '7cfb9eda1f02bdee4f34b3882f23b6a5494fb8c0a4dc5c1472076c84b224ec01',
    'partials.bell': '3522ddfe52d0c6096596cb479d05256b8546013656736051130be4375ab8d14a',
    'partials.modes': '9f1fd0f93cf64d4189519e386321f6269c4146549c9e56e2bef40a7dc44c6de9',
    'sample.seeded': 'b4ded5cbff03fb67bc7e0be1451c8a4ea8e5b295556126da33635e0c3fbca3b8',
    'sample.drawn': '14722676d7b6af60b13f89588f48981c681df68292acedfc1fa54175b2ab6a67',
    'gain.held': '60cd22e665a53a063151fab29710cd0790eae8bedbe4d7b5bb6c02b4c3849d02',
    'gain.ramp': 'af2f06e784b5a117970b7ecb792349dd74117e639b61743d64b92126f54d1799',
    'gain.lfo': 'd49ca0a5753259bc11a79f2fb3d9ff463ce483654e2d09a23d1b906e9f33cf57',
    'envelope.linear': '4f959edefeda379333f4d4dd5872db22335924b188cbe6e485118d1ee807f31f',
    'envelope.exponential': '094ff4cb5b7f5fcf256feee4d8c60e388253927d5f46ad18b3d5d538d06f6519',
    'envelope.smooth': 'deee5d690a17913e744bdb00f96b6475614ae8631a46eed74944921568bb895b',
    fade: '23a711d6d2db778ae55d771d203ceb061c437c43b99956be752fe9dbd3780b0b',
    'drive.tanh': '27a0a9043be46fe653f3a1abd3d32cd8b257614c1edda12298e25387a89ebafd',
    'drive.soft': '93fc9f184f3d956c994ac777e7597bb7b2d455c5045073bd9d067feb06d08f91',
    'drive.hard': '338d18f84cacb19eb06239a792da94e22968b9537f4cfa8f3f12a5e90d650da6',
    'drive.fold': '2a63083cc3e6677097dee136faeff432aa2c4b9bfd711339a4243decf0857f1f',
    'drive.ramp': '2b83c03a7abc93234f70e81968ca585e4ac158d9ae16fd9c7ec84b0f7d3ca19f',
    'crush.bits': '90d0628dd1bc42fabc153dda77bfa78199bc17ca1330700d53af32a51b94cb7f',
    'crush.hold': '8a7b1fcf13579e1300e51132e05d0e9fc3ecceaf622f988da0af27bec23decc9',
    'resample.up': 'd2f308e9fa7b40e49a70c528ad39bb9f6b49f36ddbdb32fc5239570509b596e2',
    'resample.down': '1e8d800a1975bbcc9bb4ce1c9b3b514af4653ca9415a89ca7c1cdc3a72b17619',
    'filter.lowpass': 'fcd2c2bc92e218babee1c6b44d0d32b060dbdd39964d3b07f1fb45f20814abfe',
    'filter.highpass': 'f266fc52310efbde9c7977dd0816676bef25a2fcf5f093a4ad35f143ec1f1db2',
    'filter.bandpass': '45f28bae2ec76548b025fc7fbaa4c558ad6bb263373c15e58f8ce7e113c54ea5',
    'filter.notch': 'e2afc78b884378a3066efa0e882f50ac831c822208d78d10cd75f6c29a90041c',
    'filter.allpass': '4640b2b59ee431928eff399ceb00246c298a74931dfc20ca6fe1d662bc1647d7',
    'filter.peak': 'da634874f7d7d00fab971aec034c5962f16069a2fa5fefb9cecac87ae4e2f8f5',
    'filter.lowshelf': '8524c3cfbfb3019a2bf6fc7daea89822ba44e455469fd5f609756e5c65f5eab5',
    'filter.highshelf': '9d4dcfff4e0cef2d74400c199806ce26d87f2f1853479ac8531caa14e476aaa1',
    'filter.moving': '2873f649eafa8150ca7fb08afe64d0eeb623ad6d819e4f277f7eaca414b9f025',
    'delay.held': '538b7171ea80ab8e2c17d1e2d7366f00da5b81f3878b4fa433c0d0a29c608656',
    'delay.lfo': 'e3fe1e3de7eef4c026990e8cf7d26144692c91fee942dad3425bcb6597b7da98',
    reverb: '8c289e7711f2f402479d782d6b7ece69455fe7e5eeb611828dc57af5bd095153',
    loop: '913bef79c563c68e6843d3ea1a3965104077bca8e9fdd8a556586d1b8454f65a',
    layer: '8c329984f64cf810495c217cb9dee9a136a7c0ede13b9fc303b2ba223bb0a4e2',
    'layer.secs': 'ce9654a0f987bb80de523e68cff90278fe249e8cf814cd65bd474f1f2dc235c8',
    sequence: '9f73d7a81d8090a100d20524f30101ed878b52349934ba541d98944e979e58ed',
    'repeat.count': '3ed146d9f02eb4cea914412d694e7b822c3ed376ffecb16f8a27f896223277db',
    'repeat.during': '7139ff9c0689ec6b84171e0b3040b3d418493a9f017bf0a86bd98f53ae106bc7',
    'repeat.poisson': 'dced65d2a45f2102e759f0f677c01bc8d7f2605c73b0e2fc393cf382cba21888',
    'pick.seed.1': 'bb7eca5599a6d6f3e77e4023d1bd7fd39ed9f3cf1803d65a516a717ad055be13',
    'pick.seed.2': '13aecf7e2a11e071e6af62b8eb3d984c44d37d570cf4bb62991fbfbeb0cd5e2e',
    'pick.seed.4': 'bb7eca5599a6d6f3e77e4023d1bd7fd39ed9f3cf1803d65a516a717ad055be13',
    'pick.chance': '13aecf7e2a11e071e6af62b8eb3d984c44d37d570cf4bb62991fbfbeb0cd5e2e',
    'vary.linear': '3e31977cf620c493733ae5ce5c1960f12d08ac9c8ee8fbf990df3a737b590304',
    'vary.log': 'c506ad824ff1e83c13256e3ed55928412b83db18b9692db13372cb0b4a4d7fa1',
    'stream.named': 'ef95f387859eec703de76fb8f57fb6d00d6d8e01376a9ecb1d683a34dae22f8b',
    'degree.minor': '94d424ca35aa673f82b4586a21cc3f8610f1d6d6eb7b591d3044740861ba7f5a',
    silence: 'a57d50eec455b6303d32099b75b8fe74211da4007e71f868a2c9cc47ac638ee0',
  }),
);
