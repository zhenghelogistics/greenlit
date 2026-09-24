# Zheng He Logistics — the brand

Read out of `ZHL_Brand_Guidelines_v1.pptx`, kept beside it so nothing has to
open PowerPoint to check a hex.

## Colour

| Name | Hex | What it is for |
|---|---|---|
| **ZHL Navy** | `#003087` (Pantone 287C) | The brand. Logo, headers, heroes |
| **Horizon Blue** | `#006EFF` · text `#0061E0` | The action. Buttons, links, highlights |
| **Pure White** | `#FFFFFF` | Logo reverse, cards |
| **Sail White** | `#F5F8FC` | Page backgrounds |
| **Ink Navy** | `#11203A` | Body text |
| **Harbor Gray** | `#5A6B80` | Captions, secondary text |

Supporting values the deck uses but does not name: `#D9E1EA` for rules and
borders, `#B5D4F4` and `#E6F1FB` as quiet blue grounds, `#C0392B` for error.

## The ratio

**60% white space · 30% navy · 10% Horizon Blue.** The deck states the reason
in one line, which is the whole rule: *"If everything is Horizon Blue, nothing
is."* Horizon Blue marks the one thing to do on a screen. A second one halves
its meaning.

Two blues are retired and must not appear: `#042B52` and `#1F3D7D`.

## Logo

Four versions: primary navy-on-white, reverse white-on-navy, icon, icon
reverse. Two rules, and they are absolute — **navy logo on white, white logo on
navy, no other combination exists**, and clear space around it equals the
height of the mark.

Never stretch it, recolour it, rotate it, add effects, place it on a busy
background, or pair it at low contrast.

## Icons

**Lucide line icons, one family, nothing else.** Navy on light, white on navy,
Horizon Blue only when the thing is clickable. Never filled, never multicolour,
and never emoji in a client-facing document.

This is already how the app is built, and the design gate already fails a build
that uses an emoji as an icon.

## Where the app disagrees today

The application's accent is `#1e40af`, which is neither ZHL Navy nor Horizon
Blue — close enough to look deliberate and wrong enough to be off-brand on
every screen. Moving it is a single token change plus a contrast re-measure,
but it changes the look of everything at once, so it is worth doing knowingly
rather than as a side effect of a login screen.
