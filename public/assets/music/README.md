# Screen music

Place one MP3 loop per screen in this directory:

| Screen state | Filename |
| --- | --- |
| `menu` | `menu.mp3` |
| `betting` | `betting.mp3` |
| `setup` | `race.mp3` |
| `race` | `race.mp3` |
| `results` | `results.mp3` |
| `summary` | `summary.mp3` |

Tracks loop automatically and crossfade over 2.5 seconds when the screen
changes. Keep loops clean at the edit point. Audio starts after the first
keyboard or pointer gesture and is silenced by F9. Files are optional while
developing; a missing track is reported in the browser console. Only add music
you have the rights to use.
