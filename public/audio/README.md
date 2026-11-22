# Voice alert recordings

Voice alerts play `/audio/{lang}/alert_{level}.mp3`, for example:

    public/audio/en/alert_high.mp3
    public/audio/pcm/alert_severe.mp3
    public/audio/ha/alert_medium.mp3

Languages: `en`, `pcm`, `ha`, `yo`, `ig`. Levels: `medium`, `high`, `severe` (voice is
only used for `high` and `severe`). Record with native speakers, mono, 64 kbps MP3,
under 45 s. Scripts to read are the `voice.*` entries in `content/alerts/{lang}.json`.

Until a file exists, the voice webhook falls back to Africa's Talking text-to-speech
using that transcript.
