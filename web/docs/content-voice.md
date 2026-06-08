# Content voice — write like a person, not a model

All human-facing prose (Learn articles, About, indicator blurbs, and the
investor AI-narrative prompt) should read like a sharp editorial writer wrote
it — not like generated filler. Search engines increasingly down-rank obvious
AI text, and readers trust it less. This is a brand requirement, not a nicety.

Run the self-check before shipping copy:

```bash
npm run ai-check          # fails on hard hits
npm run ai-check -- --report   # report only
```

It scans Learn / About / blurbs for cliché phrasing and reports sentence-length
variety. Wire it into CI if you want a hard gate.

## Rules

**Never use (hard fails):** delve, in conclusion/summary, "it's important to
note", "ever-evolving", "fast-paced", "in today's world", "a testament to",
"rich tapestry", "unlock the", "game-changer", "deep dive / dive into", "that
being said", "needless to say", "first and foremost", "plays a crucial role",
"myriad/plethora of", "navigate the", "when it comes to", "at the end of the
day". Chinese: 综上所述、总而言之、值得注意的是、在当今、随着…的发展、扮演着…角色、
至关重要、息息相关、众所周知、助力、赋能、深入探讨、不仅仅是.

**Use sparingly (soft):** leverage, robust, seamless, harness, foster, elevate,
pivotal, crucial, vital, landscape, "not only…but also", "isn't just",
"whether you're…". Chinese: 不仅…而且、为…提供了、打造、深入了解.

**Do:**
- Vary sentence length. Short punchy sentence next to a long one. (The check
  reports a coefficient of variation; aim above ~0.5.)
- Use concrete, specific detail and the occasional idiom ("cigar-butt stocks",
  "栽跟头") instead of abstract summary.
- Have a point of view. Say the thing plainly.
- Cut transition scaffolding (Moreover, Furthermore, 首先…其次…最后).

**Don't:**
- Open with a definition-of-the-obvious or "In the world of…".
- End with a tidy "In conclusion" wrap-up.
- Write three perfectly parallel clauses in a row, every time.
- Hedge every sentence.

The self-check is a floor, not the goal. Passing it doesn't make writing good —
it just means it isn't obviously machine-made. Read it aloud.
