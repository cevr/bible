export const meta = {
  name: 'night3-narrative-images',
  description:
    'Generate the 22 new narrative scene images for Night 3 v3 (image-driven rebuild), style-matched to Day 2, then verify consistency',
  phases: [
    { title: 'Generate', detail: 'one agent per scene image via okra image (Day-2 style ref)' },
    { title: 'Verify', detail: 'critic checks each image for style match + subject fidelity' },
  ],
};

const DIR =
  '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/what-is-truth/images/day3';
const REF = `${DIR}/_style-ref-day2.png`;

const STYLE =
  '16:9 widescreen devotional fine-art oil painting, classical religious illustration in the Greg Olsen / Simon Dewey lineage. STYLE: soft painterly oil-on-canvas brushwork with visible texture and no hard digital edges; warm muted earth-tone palette of golds, ambers, creams and soft browns, with cool slate-blue accents only inside the divine light; dramatic volumetric radiant light shafts from a heavenly source; soft atmospheric haze and luminous dust in the air; reverent, majestic, awe-filled mood; cinematic depth with background elements fading into golden mist. NO text, NO lettering, NO modern elements.';

// The 22 NEW beats (id -> filename + subject). Reused images (00,01,02,03,04,05,06,07,08,09,10) are skipped.
const NEW = [
  {
    id: '02',
    file: 'n02-suffering-weight.png',
    subject:
      'A lone human figure standing in a ruined, sorrowful landscape at dusk — a person bowed under grief amid the brokenness of the world (distant rubble, a bare tree, gathering shadow), yet a faint thread of warm light breaks through the heavy clouds above them. The ache of the problem of evil, rendered with compassion and dignity, not despair. The light is small but present.',
  },
  {
    id: '04',
    file: 'n04-host-at-peace.png',
    subject:
      'A vast, luminous heavenly realm filled with ranks of radiant angelic beings in serene harmony, bathed in warm golden light, gathered before a distant glorious throne. Peace, joy, perfect order. No shadow anywhere. The host of heaven worshipping in unity before sin existed.',
  },
  {
    id: '09',
    file: 'n09-heart-of-god.png',
    subject:
      'A warm, overwhelming radiance of divine love emanating from a heavenly source — golden light pouring outward like an embrace, soft and tender rather than blinding, suggesting the very heart of God. Abstract-leaning but warm and personal; the feeling of being loved. Glowing, intimate, awe-filled.',
  },
  {
    id: '11',
    file: 'n11-pride-dawns.png',
    subject:
      'A magnificent radiant covering angel, but now a subtle shadow crossing his beautiful face — pride and self-admiration dawning in his eyes as he gazes at his own glory rather than the throne. Still radiant and beautiful, but the first hint of darkness, a coldness entering. The tragedy of the highest being beginning to fall. Painterly, somber undertone beneath the gold.',
  },
  {
    id: '12',
    file: 'n12-accusation-born.png',
    subject:
      "A dark, dramatic moment in heaven — a once-radiant angel now turning away from the throne's light, a storm of shadow beginning to gather around him as other angelic figures look on in dismay. The light still shines behind him but he casts a long shadow. The birth of rebellion and accusation. Tension between the golden glory and the encroaching dark.",
  },
  {
    id: '13',
    file: 'n13-restrained-force.png',
    subject:
      'A vast heavenly throne in radiant glory, and before it the watching host of angels — a sense of a terrible choice held in restraint, mercy staying the hand of power. The light does not strike; it waits. Solemn, weighty, full of restrained love. The throne could destroy but chooses not to.',
  },
  {
    id: '14',
    file: 'n14-cosmic-courtroom.png',
    subject:
      'An immense, awe-inspiring heavenly courtroom or judgment hall stretching into golden infinity, ranks of angelic witnesses arrayed on either side, a luminous throne at the far end. The sense of a great trial about to be heard before the whole universe. Majestic, vast, reverent.',
  },
  {
    id: '16',
    file: 'n16-eden-dawn.png',
    subject:
      'The dawn of Eden — a lush, pristine garden paradise at golden sunrise, two human figures (a man and a woman) standing small in wonder amid abundant beauty, rivers and trees, soft divine light blessing the scene. The innocence and joy of the first morning. Warm, hopeful, idyllic.',
  },
  {
    id: '17',
    file: 'n17-the-tree.png',
    subject:
      "A single striking tree in the center of a beautiful garden, dappled with light and a faint shadow, set apart and significant — the tree of the knowledge of good and evil. Beautiful but charged with meaning, a serpent's coil barely visible in its branches. The one place the accuser could make his case. Lush but with an undercurrent of tension.",
  },
  {
    id: '18',
    file: 'n18-the-fall.png',
    subject:
      "The moment of the fall in Eden — a woman and man having taken the fruit, the garden's golden light beginning to dim and cool around them, the first shadow of guilt and loss on their faces as they realize what they've done. Sorrowful, the warmth draining toward grey. The turning point of the world. Tender and tragic, not lurid.",
  },
  {
    id: '19',
    file: 'n19-false-victory.png',
    subject:
      'A dark, brooding figure (the adversary) standing triumphant over a now-shadowed earth, the globe beneath a sky turned stormy and grey, his form silhouetted against a cold light — believing he has seized a kingdom. Ominous, the warm gold now mostly eclipsed by shadow. Power apparently won, but hollow.',
  },
  {
    id: '20',
    file: 'n20-father-and-son.png',
    subject:
      'The Father and the Son together in heavenly glory, heads bowed close in a moment of profound shared resolve and sorrowful love — a covenant of sacrifice being made, warm light surrounding them, the weight of a costly decision. Intimate, tender, the love between Father and Son radiant. The plan to save us, conceived in love. Depict reverently, both figures luminous.',
  },
  {
    id: '22',
    file: 'n22-world-groans.png',
    subject:
      'A weary, suffering world under a heavy sky — distant human struggle and a creation in travail — yet held within a faint, vast, encircling presence of light at the edges of the frame, as if cradled. Sorrow and patience together. The long ache of history, but not abandoned. Somber gold and grey.',
  },
  {
    id: '23',
    file: 'n23-jesus-weeps.png',
    subject:
      'Jesus of Nazareth, a first-century Jewish man with olive-brown skin and a beard, weeping — tears on his face, his expression full of compassion and grief, standing among the sorrowing. Tender, deeply human, divine love entering human pain. Close, intimate, warm light on his face.',
  },
  {
    id: '24',
    file: 'n24-justice-mercy-dilemma.png',
    subject:
      "A symbolic image of a balance or scales held in tension under a dramatic sky — justice and mercy seemingly opposed, a heavy moral weight, divine light straining between two demands. Solemn, weighty, the cross faintly foreshadowed in the composition's crossing lines. Dramatic chiaroscuro.",
  },
  {
    id: '25',
    file: 'n25-calvary.png',
    subject:
      'The crucifixion at Calvary — the cross raised against a dark, dramatic sky torn with a break of divine light, the figure of Christ upon it, the moment of ultimate sacrifice. Reverent, awe-filled, sorrowful but glorious. Warm light breaking through the storm. Not graphic or gory — dignified, painterly, the weight of love.',
  },
  {
    id: '26',
    file: 'n26-accuser-exposed.png',
    subject:
      'The cross on the hill of Calvary seen from a cosmic vantage, brilliant divine light radiating from it across the heavens, and the shadow of the adversary recoiling and shrinking away into darkness, defeated and exposed before a watching universe of light. The triumph of the cross over the accuser. Epic, redemptive, the gold overwhelming the shadow.',
  },
  {
    id: '27',
    file: 'n27-mercy-justice-meet.png',
    subject:
      'A radiant, reconciling image — scales of justice and a gesture of mercy united and at peace under the light of a cross, two former opposites now harmonized in golden glory. Resolution, peace, the heart of the night. Warm, luminous, the storm passed.',
  },
  {
    id: '28',
    file: 'n28-grace-received.png',
    subject:
      'A humble human figure kneeling in soft light, hands open and empty, receiving rather than achieving — bathed in gentle warm radiance from above, a posture of grace received as a gift. Tender, humble, hopeful. The relief of grace, not the weight of judgment. Intimate.',
  },
  {
    id: '30',
    file: 'n30-new-earth.png',
    subject:
      'The restored new earth — a radiant paradise at golden dawn, lush and whole, a great city of light glowing in the distance, redeemed people walking in joy and peace amid abundant beauty, no more shadow. The reversal of all suffering. Glorious, hopeful, overwhelmingly warm and bright. The home we were made for.',
  },
  {
    id: '31',
    file: 'n31-eternal-peace.png',
    subject:
      'A serene, eternal heavenly vista of perfect peace — a glorious throne at the center radiating gentle light over a healed creation, no darkness anywhere, a sense of forever-safety and rest. Calm, complete, secure. The final peace of the universe. Warm and still.',
  },
  {
    id: '33',
    file: 'n33-invitation.png',
    subject:
      'Jesus, a first-century Jewish man with olive-brown skin and a beard, standing with a hand extended warmly toward the viewer in gentle invitation, his face full of love and welcome, bathed in soft golden light. Personal, inviting, tender — the final appeal. The Savior reaching out to you.',
  },
];

function shellEscape(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

phase('Generate');
log(`Generating ${NEW.length} narrative scene images (Day-2 style ref, 1536x864)`);

const gen = await parallel(
  NEW.map((b) => () => {
    const prompt = `${STYLE} SUBJECT: ${b.subject}`;
    const cmd = `cd ${shellEscape(DIR)} && okra image ${shellEscape(prompt)} --ref ${shellEscape(REF)} --size 1536x864 -o ${shellEscape(b.file)} 2>&1 | tail -2`;
    return agent(
      `Run this shell command EXACTLY as given (it generates one image via the okra image CLI). It may take 1-3 minutes. After it finishes, verify the output file ${b.file} exists in ${DIR} with a non-trivial size (>100KB) using \`ls -la\`. If the command failed or the file is missing/tiny, run the SAME command ONE more time. Then report ONLY a JSON object {"id":"${b.id}","file":"${b.file}","ok":true|false,"bytes":<size>}.\n\nCOMMAND:\n${cmd}`,
      {
        label: `gen:${b.id}`,
        phase: 'Generate',
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            file: { type: 'string' },
            ok: { type: 'boolean' },
            bytes: { type: 'number' },
          },
          required: ['id', 'file', 'ok', 'bytes'],
          additionalProperties: false,
        },
      },
    );
  }),
);

const ok = gen.filter(Boolean).filter((g) => g.ok);
const failed = gen.filter(Boolean).filter((g) => !g.ok);
log(`Generated ${ok.length}/${NEW.length}; ${failed.length} failed`);

phase('Verify');

// One critic per generated image: does it match the Day-2 devotional style AND depict the right subject?
const SUBJECTS = Object.fromEntries(NEW.map((b) => [b.file, b.subject]));
const verdicts = await parallel(
  ok.map(
    (g) => () =>
      agent(
        `You are an art director checking one generated image against a style and a subject brief. Read the image at ${DIR}/${g.file} and the style reference at ${REF}.\n\nSTYLE TARGET: warm devotional fine-art oil painting (Greg Olsen / Simon Dewey lineage) — warm earth-tone palette of golds/ambers/creams/browns, soft painterly oil texture, volumetric divine light, golden atmospheric haze, reverent mood. The reference image shows the target style.\n\nSUBJECT BRIEF for this image:\n${SUBJECTS[g.file]}\n\nJudge: (1) does it MATCH the warm devotional oil-painting style? (2) does it DEPICT the subject faithfully? (3) any problem (text/lettering accidentally rendered, wrong palette e.g. too cold/desaturated, off-subject, anything jarring or off-style)? Return JSON {"file":"${g.file}","styleMatch":"strong|adequate|weak","subjectMatch":"strong|adequate|weak","issues":["..."],"regenerate":true|false}. Set regenerate=true ONLY if styleMatch or subjectMatch is weak.`,
        {
          label: `verify:${g.id}`,
          phase: 'Verify',
          schema: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              styleMatch: { type: 'string', enum: ['strong', 'adequate', 'weak'] },
              subjectMatch: { type: 'string', enum: ['strong', 'adequate', 'weak'] },
              issues: { type: 'array', items: { type: 'string' } },
              regenerate: { type: 'boolean' },
            },
            required: ['file', 'styleMatch', 'subjectMatch', 'issues', 'regenerate'],
            additionalProperties: false,
          },
        },
      ),
  ),
);

const v = verdicts.filter(Boolean);
const toRedo = v.filter((x) => x.regenerate).map((x) => x.file);

return {
  generated: ok.length,
  failed: failed.map((f) => f.id),
  verified: v.length,
  flaggedForRegen: toRedo,
  styleStrong: v.filter((x) => x.styleMatch === 'strong').length,
  styleAdequate: v.filter((x) => x.styleMatch === 'adequate').length,
};
