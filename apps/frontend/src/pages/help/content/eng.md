# Help

BITS helps you actively review exam-relevant questions. The app records more than correct or incorrect answers: it also remembers which cards should be reviewed again soon.

## How to learn effectively

- Try to retrieve the answer from memory before looking anything up. Guessing or checking immediately produces less learning benefit.
- Read the explanation after every answer. Then briefly explain in your own words why the solution is correct.
- Prefer short, regular sessions over rare, very long sessions. Time between reviews is part of the learning process.
- Treat an incorrect answer as evidence of a knowledge gap. Study the topic instead of repeatedly guessing the same card.
- Review your statistics occasionally. The important measure is not only how many cards you answered, but whether difficult material becomes more reliable over time.

## Honest Self-Assessment

When "Cover options initially" is enabled, you submit your answers with a confidence rating ("I'm sure", "I'm unsure", "Don't know"):

- **Choose "I'm unsure"** if you could not actively recall the correct answer from memory while options were covered, or if you relied primarily on process of elimination.
- **Choose "Don't know"** if you are completely uncertain. This gives you time to study the explanation immediately and queues the card for quick re-testing in your session without triggering a weakspot lock.
- **Choose "I'm sure"** only when you knew the answer actively from memory. Honest self-assessment optimizes your repetition intervals and prevents false confidence.

<!-- help-action-hints -->

## Keyboard controls

On desktop, using the keyboard is the fastest way to operate the app. For single- and multiple-choice questions, select answers with the corresponding number key. `Enter` confirms the answer or selected answers.

## Answers, sessions, and XP

For multiple-choice and matching questions, an answer can be **partly correct**. It keeps a running streak alive, but does not move the card to the next review box. Only a fully correct answer advances the box. Less than half correct is treated as incorrect.

A session continues while there are fewer than 25 minutes between learning activities. A reload or app update does not end it. The rhythm statistics count sessions once they have at least three answers and two minutes of active learning time.

You receive mastery XP for new correct or partly correct progress on a card. From the fourth answer of a qualified session, a small session bonus is added; answers 11 through 30 retain a smaller endurance bonus. The bonus rewards several short, regular sessions slightly more than one very long session. Momentum XP from these bonuses can expire after longer inactivity; your mastery XP and answer history remain intact.

The learning-rhythm statistics cover the last 28 days. Around 15 qualified sessions per week are balanced; 20 or more are exemplary. The distribution is a prompt for your own rhythm, not a comparison with other learners.

## What do B1 to B5 mean?

`B1` to `B5` are review boxes. They roughly indicate how reliably you have answered a card and when it should be prioritized again during training.

| Box | Meaning | Approximate review interval |
| --- | --- | --- |
| B1 | New or most recently answered incorrectly | may appear again soon |
| B2 | Advanced after one successful answer | about 4 hours |
| B3 | Answered correctly several times | about 1 day |
| B4 | Already fairly stable | about 3 days |
| B5 | Consolidated for longer-term recall | about 7 days |

A correct answer moves the card up one box, up to B5. A partly correct answer keeps it in its current box. An incorrect answer returns it to B1. The intervals are guidelines: training does not follow a rigid calendar. Instead, due and overdue cards receive more weight during selection.

New cards and cards in B1 can appear more often. Cards in higher boxes appear less frequently but remain part of training. This directs more time toward uncertain material without completely hiding established knowledge.

### The special case B0

B0 is not a regular review level. A card is paused there when you mark it as a weak spot yourself or answer it fully incorrectly four times in a row within 24 hours. A partly correct answer interrupts this failure sequence, but does not automatically return an already paused B0 card. Study the topic using other resources first. You can then return the card to training from the statistics page; it restarts in B1. Its existing learning history is preserved.

## Training and exam modes

### Training

In training mode, the app selects cards using their review boxes and your filters. Due, overdue, and new cards receive a higher probability; cards at your current learning level also receive a bounded boost instead of a fixed quota. A fully correct card does not appear again in the same session. After a partly correct or incorrect answer, it can return only after five distinct other cards. When no cards are due, the app stops selecting instead of forcing a mastered card. Active B0 weak spots remain paused until you return them yourself.

After each answer, you can review the solution and explanation. Auto-advance is optional; when it is disabled, you decide when to continue to the next card.

### Exam

Exam mode creates a finite run with the number of questions selected in settings; the default is 10. Each selected card appears at most once during that run. The topic filter is disabled: learning levels 1–4 use AP1, while level 5 and above use AP2 including WiSo.

At the end, you receive a result summary. Exam answers still contribute to your learning history and review boxes. Repeatedly incorrect cards are reported as weak spots after the exam is completed.

Use exam mode to assess your current position. For long-term retention, regular training with reviews spread over time remains more important.

## Learning offline

Previously loaded questions and your learning progress are stored locally in this browser. You can therefore continue learning with existing cards while offline. Clear browser data only when you intentionally want to reset the local learning state.
