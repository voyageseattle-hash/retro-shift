// The light story layer: the Grid has split into a red world and a blue world, and the only people who can see
// both are the Shifters, who race along the seam. Five rival drivers with a favourite lens and a mouth on them,
// a card at the start and end of each cup, and a scene for each secret driver who comes through.

export const PREMISE = [
  'The Grid split in two.',
  'A red world and a blue world, laid over each other like a misprinted page. Most people only ever see one.',
  'Shifters see both, and race the seam between them.',
];

// keyed by car id: the rival who drives it
export const DRIVERS = {
  vector: {
    taunted: ['Cute horn. Save it for the podium you won’t see.', 'Honk all you like. I’m still in front of you.'],
    name: 'VEX',
    lens: 'both',
    bio: 'The veteran. Raced the Grid before it split and still drives like it never did.',
    pre: ['Stay in both worlds and you never miss a wall. Or a corner.', 'Kid, I was shifting when you were a loading screen.', 'Clean lines. Clean race. Try to keep up.'],
    win: 'Experience is just ghosts you already beat.',
    lose: 'Fine. Nobody wins every split.',
    pass: 'Patience, rookie.',
    downed: ['Lucky hit. Don’t get used to it.', 'Okay. I felt that one.'],
    final: ['Last lap. This is where rookies fold.', 'One lap left. Don’t blink.'],
  },
  scanline: {
    taunted: ['Was that a horn or a squeak?', 'Oh, it’s ON. Red-line ON.'],
    name: 'LINA SCAN',
    lens: 'red',
    bio: 'Speed freak. Lives in the red world because the red world has fewer brakes.',
    pre: ['Red is faster. Everyone knows red is faster.', 'Blink and you’ll miss me. Shift and you’ll still miss me.', 'I don’t take shortcuts. I take red ones.'],
    win: 'Told you. Red is faster.',
    lose: 'That was a blue-world fluke.',
    pass: 'See you never!',
    downed: ['Hey! I was in the red! That doesn’t count!', 'Ugh, my paint! My SPEED!'],
    final: ['Final lap! Red line all the way home!', 'Last lap. Try and keep up!'],
  },
  polygon: {
    taunted: ['Noted. Adjusting your threat level up 2 percent.', 'Honking costs you 0.4 seconds. I timed it.'],
    name: 'POLLY GONE',
    lens: 'blue',
    bio: 'Counts facets, measures angles, has a spreadsheet for every blue-only cut on the Grid.',
    pre: ['The blue line is 3.8 percent shorter. I checked.', 'Statistically, you crash on lap two.', 'Every wall is solid in one world. Choose wisely.'],
    win: 'As calculated.',
    lose: 'Recalculating...',
    pass: 'Optimal line, sorry.',
    downed: ['That was not in the model.', 'Collision logged. Revenge scheduled.'],
    final: ['Final lap. Your odds have not improved.', 'Last lap. I have run the numbers.'],
  },
  chroma: {
    taunted: ['Rude. Gorgeous, but rude.', 'Darling, don’t honk at the main character.'],
    name: 'KROMA',
    lens: 'both',
    bio: 'All style. Shifts for the light show, wins by accident, poses either way.',
    pre: ['Red, blue, both... darling, I wear them all.', 'If I can’t win, at least I’ll look amazing losing.', 'Try not to scuff my paint.'],
    win: 'And the crowd goes violet!',
    lose: 'At least my lighting was perfect.',
    pass: 'Mwah!',
    downed: ['My finish! You absolute vandal!', 'Darling, that was NOT my angle.'],
    final: ['Last lap, darling. Save me a spot in the photo.', 'Final lap! Lights, camera, me!'],
  },
  raster: {
    taunted: ['BEEP BEEP to you too, noob.', 'Achievement unlocked: made RAZ mad.'],
    name: 'RAZ',
    lens: 'red',
    bio: 'An 8-bit kid in a 3-D world. Thinks in pixels, talks in high scores.',
    pre: ['Insert coin. Prepare to lose a life.', 'This track is just a really big sprite.', 'Player two has entered the game. It’s me. I’m player one.'],
    win: 'NEW HIGH SCORE!',
    lose: 'Continue? 9... 8... 7...',
    pass: 'Pixel perfect!',
    downed: ['LOST A LIFE! You owe me a quarter!', 'Respawning... with a grudge.'],
    final: ['FINAL STAGE! Cue the boss music!', 'Last lap! No continues!'],
  },
  glitch: {
    taunted: ['h-h-honk? honk. HONK.', 'I heard that before you pressed it.'],
    name: 'GL1TCH',
    lens: 'blue',
    bio: 'Fell through the seam once and came back wrong. Nobody knows which world GL1TCH is in. Neither does GL1TCH.',
    pre: ['I’ve r-r-raced this one before. Or after.', 'The s̶e̶a̶m is louder today.', 'Which world are you in? Are you sure?'],
    win: 'w1nn3r w1nn3r w1nn3r',
    lose: 'that didn’t h4ppen. that didn’t h4ppen.',
    pass: 'excuse m3 (from the other side)',
    downed: ['i f-f-fell through. again.', 'that hurt in b0th worlds.'],
    final: ['last l4p. or the first. hard to say.', 'the s̶e̶a̶m is closing. hurry.'],
  },
};
export const driverOf = (carId) => DRIVERS[carId] || null;
export const pick = (arr, seed = Math.random()) => arr[Math.floor(seed * arr.length) % arr.length];

export const CUP_STORY = {
  signal: {
    intro: ['THE SIGNAL CUP', 'Five courses where the split first happened. The seam is quiet here, the walls are honest, and the rivals are hungry.', 'Win it and the Grid starts paying attention.'],
    win: ['SIGNAL CUP CHAMPION', 'The leaderboard flickers red, then blue, then your name in both.', 'Somewhere out past the Void Field, the static is getting louder.'],
    podium: ['SIGNAL CUP PODIUM', 'Not bad. Not first. VEX nods at you across the pit lane, which from VEX is practically a hug.'],
    lose: ['SIGNAL CUP', 'The seam doesn’t care who wins. Come back faster.'],
  },
  static: {
    intro: ['THE STATIC CUP', 'Out where the worlds wear thin. Roads that only exist in one lens, walls that only exist in the other.', 'GL1TCH says the seam is tearing out here. GL1TCH says a lot of things.'],
    win: ['STATIC CUP CHAMPION', 'At the finish line the seam rips open for a heartbeat, and through it you see other worlds entirely: an ink-drawn page, a desert arena full of wrecked trucks.', 'Something on the other side saw you too.'],
    podium: ['STATIC CUP PODIUM', 'The static settles. GL1TCH waves at you from a world you can’t quite see.'],
    lose: ['STATIC CUP', 'The static wins this time. It always sounds like laughter.'],
  },
  toybox: {
    intro: ['THE TOYBOX CUP', 'Somewhere the seam runs through a kid’s bedroom. The lights are off, the blacklight is on, and from down here every toy is a mile long.', 'Five toys, one room. Don’t wake the cat.'],
    win: ['TOYBOX CUP CHAMPION', 'The flippers have stopped, the last domino is down and the book is shut. A glow star peels off the ceiling and lands at your wheels like a medal.', 'Under the bed, something that isn’t a toy is waiting for you.'],
    podium: ['TOYBOX CUP PODIUM', 'Not bad for something small enough to be lost down the back of the desk.'],
    lose: ['TOYBOX CUP', 'Back in the box. The cat opens one eye, and closes it again.'],
  },
  paradox: {
    intro: ['THE PARADOX CUP', 'Past the tear, the Grid stops pretending to make sense. Roads with one side, rooms with six floors, a city that folds over your head.', 'Five courses that shouldn’t exist. Race them anyway.'],
    win: ['PARADOX CUP CHAMPION', 'Up is a suggestion, the finish line was behind you the whole time, and your name is on the board in a colour that has no name.', 'One door is left, and it opens in a direction you can’t point to.'],
    podium: ['PARADOX CUP PODIUM', 'You came out the way you went in, which out here counts as a result.'],
    lose: ['PARADOX CUP', 'The stairs only go up. Somehow you still ended at the bottom.'],
  },
};

// The two secret drivers come through the seam.
export const SECRET_SCENES = {
  dash: {
    title: 'DASH JOINS THE GRID',
    from: 'from LAST LINE',
    lines: [
      'A page tears open over the track. A stick figure tumbles out, red headband streaming, still holding a pencil.',
      'He looks at the red world. He looks at the blue world. He squints, one eye at a time, and grins.',
      '“I’ve done this before. Which way’s the finish?”',
    ],
  },
  greatwedge: {
    title: 'THE GREAT WEDGE HAS ARRIVED',
    from: 'from ABSURD COMBAT RACING',
    lines: [
      'The ground shakes. A shark fin slices through the grid floor, then the rest of it: a stainless-steel monster truck, tyres taller than your craft.',
      'Captain Finn Razorback leans out of the cab. “Ahoy, little hover-boats. No missiles here? Pity.”',
      '“Never mind. I’ll just ram you.”',
    ],
  },
};
