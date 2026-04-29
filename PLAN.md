# Scale42 site — outstanding plan

Canonical backlog. Items here are tracked, deferred, or for-later. The user has asked not to be reminded about these in every reply — refresh this file when status changes instead.

## Now / unblocked
_(empty — pick from "Soon" when ready)_

## Soon (need user input or external action)
- **Formspree form ID** — sign up at formspree.io free tier, paste ID, replace `YOUR_FORM_ID` in `index.html` and `no/index.html` so the contact form actually sends.
- **Real partner logos** — once GIG / a hyperscaler / DCD respond with press packs, drop SVG/PNG into `assets/partners/` and replace the text labels in the home page partner strip.
  - Sourcing notes:
    - **GIG** — no public press kit found. Email and request the official asset pack.
    - **DCD** — has a media kit on datacenterdynamics.com. Request use rights for an "as featured in" strip.
    - **Yle** — brand guide on yle.fi; trademark protected. Fine for nominative editorial use only.
    - **FT** — HIGH legal risk to self-host. Use only their official "As featured in the FT" badge programme (aboutus.ft.com), or stay with the text label.
    - **Nvidia** — wordmark on Wikimedia Commons (`File:NVIDIA_logo.svg`) as PD-textlogo, trademark-protected. Direct URL: `https://upload.wikimedia.org/wikipedia/commons/a/a4/NVIDIA_logo.svg`. Only use if a real industry-context link exists; never imply partnership.

## Plan-for-later (skip until specifically asked)
- **Per-site PDF spec sheets** for Glomfjord / Bakki / Varkaus. Gated download on the press page and per-site detail pages. Need site fact sheets from delivery team first.
- **Real DC site photography** — drop-in to `assets/sites/` (`glomfjord.jpg`, `bakki.jpg`, `varkaus.jpg`). Current placeholders are gradient panels.
  - Sourcing notes from research:
    - Google search blocked WebFetch (EU consent redirect). Use a browser instead, or scripted tooling that handles consent.
    - **Glomfjord** → Wikimedia Commons categories: `Category:Glomfjord` and `Category:Glomfjord_Hydroelectric_Power_Station`. Reliable uploaders: Frankemann, Clemensfranz (CC BY-SA 3.0/4.0). Unsplash has thin coverage; fall back to "Nordland fjord".
    - **Bakki / Húsavík** → Wikimedia `Category:Húsavík`, `Category:Þeistareykir_Power_Station`, `Category:PCC_BakkiSilicon`. Unsplash "Husavik" is strong (Tim Trad, Jonatan Pie).
    - **Varkaus** → Wikimedia `Category:Varkaus` (uploader "Htm" has the most). Otherwise "Saimaa" or "Finnish lake" on Unsplash/Pexels.
    - **Hero / Nordic generic** → Unsplash "Lofoten", "Norway fjord", "Iceland highlands". Photographers: Jonatan Pie, Luca Bravo, Johny Goerend, Claudio Schwarz.
    - Always grab the Commons file page URL + uploader's stated attribution string at download time.

## Optional polish (do if quiet, otherwise leave)
- **OG share image** designed in brand colours (1200×630 PNG) for clean LinkedIn / X / Slack previews. Currently re-using `logo.png` which works but is sub-optimal.
- **Light-text logo variant** for dark surfaces (footer / contact band). Current SVG reads OK but a white-wordmark variant would be sharper.
- **Light/dark theme toggle** site-wide.
- **Newsletter signup** (Buttondown free tier).
- **Cloudflare Web Analytics** (cookieless, no banner needed).

## Done — for context
- Pan-Nordic interactive map at top of `/datacenters.html`
- Per-site detail pages: Glomfjord / Bakki / Varkaus
- Capabilities, Careers, Press pages
- Brand page with palette, typography, patterns, iconography, photography mood, motion, accessibility, voice, logo downloads (all variants)
- EN + Norwegian (Bokmål) versions of: home, datacenters, capabilities, careers, press, brand
- Auto language detection (`lang.js`) routing Norwegian visitors to `/no/`
- Logo: transparent SVG primary + square + circle variants, PNG renders at 512 / 1024, proper favicon set
- Sustainability KPIs strip + cert strip (ISO targets + CSRD + Tier III)
- Section background patterns (Hex / Grid / Diagonal / Topo) + hero parallax
- Sitemap with hreflang pairs, robots.txt, webmanifest, security headers (`_headers`), redirects
- Partner strip migrated to safe text labels ("As featured in DCD/FT/Yle")
- Live deploy: GitHub `jc230285/scale-42` → Coolify auto-deploy → https://s42.sandstormlogic.com
