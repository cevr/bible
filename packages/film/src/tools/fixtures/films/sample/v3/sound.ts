// The third version's sound: one score option in one movement, from its
// first scene. Data only.

export const sound = {
  score: {
    play: 'piano',
    under: -18.5,
    alone: -6,
    options: {
      piano: {
        model: 'music_v2',
        styles: ['felt piano'],
        avoid: [],
        movements: [{ from: 'seed', name: 'sowing', styles: ['felt piano'] }],
      },
    },
  },
  effects: {},
};
