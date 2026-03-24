You see here vite+vue+ts boilerplate, or rather, a copied over app from some other productivity tracking app.
Remove the traces of the productivity app and please implement the following prototype:

This should be a multiple/single choice practice app.

The source of truth for the exercise data is `public/data/exercises`, which refers sometimes to images in `public/data/img`.

For now, build just a single page, the "main" view, which loads random exercises and goes through a Q/A flow with it.

The app should first and foremost be optimized for mobile devices in landscape mode.
In that case, the question has a column on the left (max 50%), and answer stuff is in a column on the right (max 50%).
On desktop and portrait mobile, use instead a single column layout.

The question section is always the same:
Show the `instruction` (if any), then referred images (if any).
Wrap any image in an openseadragon container for easy zoom (some of the images are quite finicky to read otherwise).

On the right, on the answer section, stuff varies based on `inputMode`.
In general, since the user is holding a mobile device in landscape, we want all interaction element at the right edge, for easy thumb interaction.

We have the following modes:

- `SINGLE_CHOICE`: show each of the options as buttons. Tapping a button sets it to primary color (and all other buttons to standard color, since it's single choice). If `submitButton` property is `true` or doesn't exist, show a submit button on the bottom below the options. Once submitted, make all buttons non-interactible and color buttons appropriately according to *was correct and selected*, *was not correct but selected*, and *was correct but not selected*, following accepted standard. After 0.5 seconds go to next question. If `submitButton` `false`, immediately trigger this procedure when any button is clicked
- `MULTIPLE_CHOICE`: similar as above, only instead of making the options buttons, make a checkbox to the right of each option, putting the options in subtle daisy cards (since it's multiple choice). There is always a submit button here.
- `TEXT`: Simple text input, with submit button. Note that there are optional props here to ignore casing, and a maximum string distance allowed to tolerate small typos (add a library for this). Once submitted, if within is-correct parameters, simply replace the input with a green box with the correct answer (possibly correcting minor typos). If considered incorrect, show the user answer as strike through and the correct answer below it. If correct, go to next after 0.5 seconds. If incorrect, go to next after 1s.
- `NUMBER`: Like text, only with a number input

Architect this cleanly, following solid patterns. We will likely add more such types in the future. 

I may want to make the 0.5 second-auto-next-card function optional later. Architect in such a way it can be easily toggled with a manual "Next exercise" button later.

Interpret all strings in exercises as proper markdown, full feature support (instructions, answeroptions). Get a library for this.



Do not persist any practice/progress data yet, that comes later.
Ignore any dexie stuff for now.

Add i18n for German and English, following latest best practices.
Make the language files for deu and eng. 
Add eslint, and as a rule disallow plain (non-i18n) strings in the app.

Stick to `agents.md`!!!!!!!!!

Feel free to WEB!!! search recommendations for patterns etc.