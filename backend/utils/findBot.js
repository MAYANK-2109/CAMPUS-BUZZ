/**
 * utils/findBot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * "Find BOT" — turns a plain-language request into buttons that take the user
 * where they wanted to go.
 *
 *   "i want a ride split"  →  [ 🚕 Ride Split ]  → /rides
 *   "where do i book a seat" → [ 📚 Library Seats ] → /library
 *
 * Not a conversational model and not trying to be. It is an intent router: the
 * app has eleven destinations, most students never find half of them, and a
 * search box that answers in buttons beats a navbar they have to decode.
 *
 * Matching reuses the same approach as the lost-and-found matcher — sanitise,
 * split, score keyword overlap — so there is one way this codebase does text
 * matching rather than two. No models, no external calls.
 *
 * ── Scoring ─────────────────────────────────────────────────────────────────
 * Two signals, deliberately weighted differently:
 *
 *   phrases   – a multi-word phrase matched inside the query is worth far more
 *               than a single keyword. "ride split" appearing verbatim is near
 *               proof of intent; the word "split" alone is not, since it is
 *               shared by ride split and food split.
 *   keywords  – single tokens, worth 1 each.
 *
 * Ambiguity is a feature here: "split" legitimately matches both ride and food
 * split, and offering two buttons is a better answer than guessing one.
 */

const { sanitize } = require('./lostFoundMatcher');

/** A phrase hit is worth this many keyword hits. */
const PHRASE_WEIGHT = 3;

/** Below this score an intent is not offered at all. */
const MIN_SCORE = 1;

/** Most buttons to show. Beyond a handful the answer stops being an answer. */
const MAX_ACTIONS = 3;

/**
 * The destination registry.
 *
 * `label` is the button text, `route` is where it goes, `emoji` fronts the
 * button. `phrases` are matched as substrings of the sanitised query;
 * `keywords` as whole tokens.
 *
 * To add a destination, add an entry. Nothing else needs to change.
 */
const INTENTS = [
  {
    id: 'rides',
    label: 'Ride Split',
    emoji: '🚕',
    route: '/rides',
    blurb: 'Share a cab and split the fare with other students.',
    phrases: ['ride split', 'cab split', 'split a cab', 'split the fare', 'share a cab',
              'share a ride', 'going to airport', 'go to airport', 'cab to', 'auto to',
              'ride share', 'car pool', 'carpool'],
    keywords: ['ride', 'rides', 'cab', 'cabs', 'taxi', 'auto', 'uber', 'ola', 'fare',
               'airport', 'station', 'railway', 'drop', 'pickup', 'travel', 'trip'],
  },
  {
    id: 'foodsplit',
    label: 'Food Split',
    emoji: '🍕',
    route: '/feed?hashtag=%23foodsplit',
    blurb: 'Split a food order with people nearby.',
    phrases: ['food split', 'split food', 'order food', 'split an order', 'share food',
              'group order', 'split the bill'],
    keywords: ['food', 'foodsplit', 'pizza', 'swiggy', 'zomato', 'order', 'meal',
               'dinner', 'lunch', 'snack', 'hungry', 'canteen', 'mess'],
  },
  {
    id: 'resell',
    label: 'Buy & Sell',
    emoji: '🏷️',
    route: '/feed?hashtag=%23resell',
    blurb: 'Buy and sell used items with other students.',
    phrases: ['want to sell', 'want to buy', 'second hand', 'used item', 'sell my',
              'buy a', 'for sale', 'resell'],
    keywords: ['sell', 'selling', 'buy', 'buying', 'resell', 'cycle', 'bike', 'laptop',
               'calculator', 'book', 'books', 'furniture', 'price', 'cheap', 'marketplace'],
  },
  {
    id: 'lostfound',
    label: 'Lost & Found',
    emoji: '🔍',
    route: '/feed?hashtag=%23lost',
    blurb: 'Report something you lost, or something you found.',
    phrases: ['lost and found', 'lost my', 'i lost', 'found a', 'i found', 'missing item',
              'left my', 'misplaced my'],
    keywords: ['lost', 'found', 'missing', 'misplaced', 'wallet', 'keys', 'id', 'card',
               'phone', 'bottle', 'bag', 'earphones', 'watch'],
  },
  {
    id: 'library',
    label: 'Library Seats',
    emoji: '📚',
    route: '/library',
    blurb: 'Check and book a seat in the library.',
    phrases: ['library seat', 'book a seat', 'reading room', 'study room', 'seat available',
              'reserve a seat', 'study space'],
    keywords: ['library', 'seat', 'seats', 'booking', 'reading', 'study', 'studying', 'desk'],
  },
  {
    id: 'complaints',
    label: 'Complaints',
    emoji: '📣',
    route: '/complaints',
    blurb: 'Raise a complaint anonymously, or upvote an existing one.',
    /**
     * Institutional food belongs here, not in Food Split.
     *
     * "mess food is getting wasted" is a grievance about the canteen; "my food
     * is getting wasted" is someone with a surplus who wants to share it. The
     * discriminator is the subject — mess/canteen/hostel vs. my — so the
     * institutional words are phrases here and the bare word "food" is
     * deliberately NOT a keyword. Adding it would make every food query in the
     * app surface a complaint button.
     */
    phrases: ['file a complaint', 'raise a complaint', 'report a problem', 'complain about',
              'issue with', 'not working', 'is not working', 'does not work',
              'mess food', 'canteen food', 'hostel food', 'food quality', 'mess quality',
              'food is bad', 'food is stale', 'food is cold', 'food is terrible',
              'poor quality', 'bad quality', 'no water',
              'no electricity', 'no wifi', 'fed up', 'sick of', 'something is wrong'],
    keywords: ['complaint', 'complaints', 'complain', 'grievance', 'problem', 'issue',
               'broken', 'hostel', 'warden', 'water', 'electricity', 'wifi',
               'mess', 'canteen', 'quality', 'stale', 'rotten', 'unhygienic', 'hygiene',
               'dirty', 'filthy', 'cockroach', 'insect', 'smell', 'stink', 'leaking',
               'unfair', 'harassment', 'maintenance', 'repair', 'cleanliness'],
  },
  {
    id: 'calendar',
    label: 'Events Calendar',
    emoji: '📅',
    route: '/calendar',
    blurb: 'See what is happening on campus.',
    phrases: ['what events', 'upcoming events', 'event calendar', 'whats happening',
              'fest schedule', 'any events'],
    keywords: ['event', 'events', 'calendar', 'fest', 'schedule', 'workshop', 'seminar',
               'competition', 'hackathon', 'rsvp'],
  },
  {
    id: 'chat',
    label: 'Chat Rooms',
    emoji: '💬',
    route: '/chat',
    blurb: 'Join a chat room or start one.',
    phrases: ['chat room', 'chat rooms', 'talk to', 'group chat', 'join a room',
              'create a room', 'message someone'],
    keywords: ['chat', 'chats', 'room', 'rooms', 'talk', 'discuss', 'discussion',
               'group', 'conversation'],
  },
  {
    id: 'resources',
    label: 'Resources',
    emoji: '📁',
    route: '/resources',
    blurb: 'Notes, papers and study material.',
    phrases: ['study material', 'previous year', 'question paper', 'lecture notes',
              'past papers', 'reference material'],
    keywords: ['resource', 'resources', 'notes', 'material', 'pdf', 'paper', 'papers',
               'syllabus', 'assignment', 'reference'],
  },
  {
    id: 'clubs',
    label: 'Club Feed',
    emoji: '🎭',
    route: '/club',
    blurb: 'Announcements and posts from campus clubs.',
    phrases: ['club feed', 'club posts', 'club announcement', 'which clubs',
              'join a club', 'club activities'],
    keywords: ['club', 'clubs', 'society', 'announcement', 'announcements', 'recruitment',
               'audition', 'auditions'],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    emoji: '🔔',
    route: '/notifications',
    blurb: 'Everything you have been alerted about.',
    phrases: ['my notifications', 'any alerts', 'what did i miss', 'notification'],
    keywords: ['notification', 'notifications', 'alert', 'alerts', 'updates'],
  },
  {
    id: 'profile',
    label: 'My Profile',
    emoji: '👤',
    route: '/profile',
    blurb: 'Your posts, saved items and settings.',
    phrases: ['my profile', 'my posts', 'my account', 'saved posts', 'edit profile'],
    keywords: ['profile', 'account', 'saved', 'bio', 'avatar', 'settings'],
  },
];

/**
 * scoreIntent
 * ───────────
 * Phrase hits are checked against the sanitised query string (substring, so
 * word order matters); keyword hits against its token set.
 */
/**
 * Expands a token set with singular forms, so a keyword list written in the
 * singular still matches plural input.
 *
 * "there are cockroaches in the mess" was scoring 0 on the complaints keyword
 * "cockroach" purely because of the trailing s. Handling it here rather than
 * doubling every keyword list keeps the registry readable — and a registry
 * people are willing to edit is the whole point of this design.
 *
 * Deliberately crude: strip a trailing "es" then "s", keep both the original
 * and the stem. Over-stemming is harmless because both forms stay in the set,
 * so a wrong stem simply never matches anything.
 */
const withSingulars = (tokens) => {
  const out = new Set(tokens);
  for (const token of tokens) {
    if (token.length > 4 && token.endsWith('es')) out.add(token.slice(0, -2));
    if (token.length > 3 && token.endsWith('s'))  out.add(token.slice(0, -1));
  }
  return out;
};

const scoreIntent = (intent, query, tokens) => {
  let score = 0;
  const reasons = [];

  for (const phrase of intent.phrases) {
    if (query.includes(phrase)) {
      score += PHRASE_WEIGHT;
      reasons.push(phrase);
    }
  }

  for (const keyword of intent.keywords) {
    if (tokens.has(keyword)) {
      score += 1;
      reasons.push(keyword);
    }
  }

  return { score, reasons };
};

/**
 * ask
 * ───
 * @param   {string} rawQuery Whatever the user typed.
 * @returns {{ reply: string, actions: Array<{id,label,emoji,route,blurb}>, matched: boolean }}
 *
 * Always answers. An unmatched query gets the full menu rather than a dead end —
 * a bot that says "I didn't understand" has wasted the user's turn.
 */
const ask = (rawQuery) => {
  const query = sanitize(rawQuery || '');

  if (!query) {
    return {
      matched: false,
      reply: 'Tell me what you need and I will take you there. Try "I want a ride split".',
      actions: INTENTS.slice(0, MAX_ACTIONS).map(toAction),
    };
  }

  const tokens = withSingulars(query.split(' '));

  const ranked = INTENTS
    .map((intent) => ({ intent, ...scoreIntent(intent, query, tokens) }))
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ACTIONS);

  if (ranked.length === 0) {
    return {
      matched: false,
      reply: "I could not tell what you were after. Here are the places people ask for most — or try naming the thing you want, like \"cab to the airport\" or \"library seat\".",
      actions: [INTENTS[0], INTENTS[4], INTENTS[6]].map(toAction),
    };
  }

  const top = ranked[0];
  const reply = ranked.length === 1
    ? `${top.intent.blurb} Tap below to go there.`
    : `Sounds like ${top.intent.label}. If not, one of these should be it:`;

  return { matched: true, reply, actions: ranked.map((r) => toAction(r.intent)) };
};

function toAction(intent) {
  return {
    id:    intent.id,
    label: intent.label,
    emoji: intent.emoji,
    route: intent.route,
    blurb: intent.blurb,
  };
}

module.exports = { ask, INTENTS, PHRASE_WEIGHT, MIN_SCORE, MAX_ACTIONS };
