# VoiceRehab

**A voice-first home exercise companion for physiotherapy patients in India.**
Built for the Scaler × Wispr Flow *India Runs on Voice* hackathon — theme: **Healthcare access**.

Patients recovering from knee, back, shoulder or stroke problems are given home exercises on a printed sheet. Many are older, find screens and English text hard, and quietly skip their routine. The physiotherapist only finds out at the next visit.

VoiceRehab lets the patient do the whole routine **just by talking**: it explains each exercise aloud, counts reps, asks for a pain score, confirms it back, and sends a daily summary to the clinic dashboard. It raises alerts for high or rising pain.

## Run it (one command)

```bash
docker compose up
```

Then open **http://localhost:8080** in **Google Chrome** and allow microphone access.

- Patient app: http://localhost:8080
- Clinic dashboard: http://localhost:8080/dashboard.html

**No API keys or accounts needed.** Speech uses the browser's built-in Web Speech API. Data is stored in the browser (sample patients and 2 weeks of demo history are pre-loaded).

Without Docker you can serve the `public/` folder with any static server, e.g. `cd public && python3 -m http.server 8080`.

## The voice flow

1. Tap the mic and say **"Start my exercises"**. Other home commands: **"Remind me at 7 in the morning"**, **"Call my physio"**.
2. For each exercise VoiceRehab says its name, reps and how to do it, then waits: **"Say ready when you're ready."**
3. Say **"Ready"**. It counts every rep aloud with a big on-screen counter.
4. It asks: **"How much pain did you feel, from 0 to 10?"** Answer naturally, e.g. "six", "around 5", "5 or 6", "no pain".
5. It confirms: **"Pain 6. Is that right?"** Say yes or no.
6. At any time say: **Repeat · Slower · Faster · Skip · Stop · Call my physio**.
7. When the routine ends, it reads out a summary and the clinic dashboard updates.

## When things go wrong

| Situation | What VoiceRehab does |
|---|---|
| Unclear speech or noise | "Sorry, I didn't catch that. Please say it again." After 2 failed tries it shows large tap buttons. |
| Silence | Gentle re-prompt after ~10 s. After ~30 s it pauses: "Say continue when you're ready." |
| Accents / mixed language | Uses Indian English (`en-IN`) recognition, checks up to 3 alternatives, and matches intent rather than exact words. Understands common Hinglish words (haan, nahi, aage, bas, dheere, phir se). |
| Pain number misheard | Always confirmed back. Ranges are saved as the higher value. Numbers above 10 are rejected and asked again. |
| Danger words ("severe pain", "I fell", "can't move") | Stops the session immediately: "Please stop and rest. I'm alerting your physiotherapist now." The patient is flagged on the dashboard. |
| Mic blocked / unsupported browser | Buttons and a type box let the patient finish the session anyway. |

## Clinic dashboard

- Today's status for each patient: Done / Partial / Not done
- 14-day pain trend chart, with a line at 7
- Flags: high pain (7+), pain rising 3 sessions in a row, low adherence, emergency reports, call-back requests
- Patients sorted by urgency

## Project structure

```
docker-compose.yml   # nginx serving ./public on port 8080
public/
  index.html         # patient app
  dashboard.html     # clinic dashboard
  css/style.css      # large-text, high-contrast UI for older users
  js/data.js         # exercise library, sample patients, storage
  js/voice.js        # speech in/out, intent + pain-score + time parsing
  js/app.js          # session flow: ask → listen → confirm, error handling
  js/dashboard.js    # adherence, pain trends, flags
```

## Roadmap (finale)

Kannada, Hindi, Tamil and Telugu voice; clinic login and real patient records; WhatsApp reminders and summaries; physio plan builder.
