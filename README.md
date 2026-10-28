# V Energy website

The marketing site for **V Energy** (Vees Capital (Pty) Ltd), solar installers in Northriding, Randburg.
It is a static site: plain HTML, CSS and JavaScript with no build step and no frameworks, so it runs on
any web host (cPanel/Apache, LiteSpeed, Netlify, GitHub Pages, …).

## What's on the page

| Section | What it does |
| --- | --- |
| Hero | Headline, booking and savings CTAs, 3D photo stage with live-style monitoring chips |
| Trust strip | Key numbers and a scrolling list of brands we install |
| Services | Homes, business, load-shedding backup, maintenance, emergency call-outs |
| Simulator | Interactive day in a solar home: drag the sun, switch load-shedding on and off |
| Smart solar advisor | Three questions → recommended package, savings, payback, CO₂ |
| Packages | 2.5 / 3 / 5 / 10 kVA packages with prices, plus a custom/commercial card |
| Why V Energy, process, recent installs, reviews, FAQ, contact | Trust, SEO content and conversion points |
| Booking dialog | 3-step "book a free call" flow: visitors pick a time only (SAST) and the site works out the next working day with that time free; calendar file and WhatsApp copy of the booking |

Every "Book a free call" button opens the booking dialog. If JavaScript is off, the same buttons jump to
the call-back form, which still posts normally.

Bookings and call-back requests are emailed through FormSubmit to the address behind the endpoint, with
copies to sales@ and marshall@. The WhatsApp buttons open WhatsApp with the details filled in, addressed to
the number in `CONFIG.whatsapp`; the visitor still taps Send, because a website cannot send a WhatsApp
message on its own.

## Files

```
index.html            the page (content, SEO tags, structured data)
Thankyou.html         shown after a form is sent without JavaScript (FormSubmit redirect)
privacy.html          POPIA privacy notice
404.html              not-found page (wired up in .htaccess)
assets/css/styles.css all styles
assets/js/main.js     all behaviour; settings live in CONFIG at the top
assets/fonts/         self-hosted Sora + Inter (SIL Open Font License)
assets/img/           optimised photos (AVIF + WebP, several widths), brand icons, og-image.jpg
media/originals/      full-size source photos used to build assets/img (not needed on the server)
tools/build_images.py rebuilds assets/img from media/originals
robots.txt, sitemap.xml, site.webmanifest, favicon.*, apple-touch-icon.png, .htaccess
```

## Common edits

- **Prices / packages**: edit the package cards in `index.html` (search for `pkg-price`), the FAQ answer
  about cost, the `hasOfferCatalog` block in the structured data, and `PACKAGES` in `assets/js/main.js`
  (used by the advisor).
- **Phone numbers, WhatsApp, email**: search `index.html` for `27108245582`, `27790410946`, `27813471724`
  and `sales@venergy.co.za`. WhatsApp goes to 081 347 1724: the `wa.me/27813471724` links in the HTML
  pages and `CONFIG.whatsapp` in `main.js`.
- **Call-back hours and holidays**: `CONFIG.hours` and `CONFIG.holidays` in `main.js`.
- **Advisor assumptions** (tariff, sun hours, panel size): `CONFIG` in `main.js`.
- **Form destination**: forms post to FormSubmit using the existing endpoint
  (`3cd046a3a50af33a7b7bb5796841d5ac`), CC'ing sales@ and marshall@. Change it in `CONFIG.formAjax`
  and in the `action` / `_cc` fields in `index.html`.
- **After editing CSS or JS**, bump the `?v=` number on the `styles.css` and `main.js` links in the HTML
  files so returning visitors get the new version.

## Photos

To add or replace a photo:

1. Put the full-size original in `media/originals/`.
2. Add or edit its entry in `IMAGES` in `tools/build_images.py` (crop box and output widths).
3. Run `python3 tools/build_images.py` (needs Python 3 with Pillow 11.3 or newer for AVIF).
4. Reference the generated `assets/img/<name>-<width>.avif/.webp` files with a `<picture>` element,
   following the existing examples in `index.html`.

More real project photos (especially rooftop arrays on South African homes) will make the biggest difference to
trust and conversion. The three "Recent installations" photos are V Energy's own work; the other photos
were carried over from the previous site, so confirm you hold the rights to them, or swap in licensed
stock (for example from Unsplash or Pexels).

## Before going live

- [ ] Replace the nine **sample reviews** in the Reviews section with genuine customer reviews and their real
      star ratings (for example from your Google Business Profile). They are placeholders and must not be
      published as real reviews.
- [ ] Confirm the claims and details: "10+ years / since 2016", the 5-star rating badges in the hero and the
      stats strip (they should match your real Google rating), the brand list, call-back hours,
      and the areas served (all nine provinces).
- [ ] Name the neighbouring countries you work in, if you want them listed: the site currently says
      "neighbouring countries" without naming them (Areas we serve, and the FAQ about areas).
- [ ] Check the office address spelling ("Franourt Office Park") matches your Google Business Profile.
- [ ] Confirm package prices are current.
- [ ] Make sure the site is served over HTTPS (canonical and social tags use `https://venergy.co.za/`).
- [ ] Submit `https://venergy.co.za/sitemap.xml` in Google Search Console.

## Deploying

Upload everything except `media/`, `tools/` and `README.md` to the web root (the folder that holds
`index.html`). The `.htaccess` file adds compression, caching and the 404 page on Apache/LiteSpeed hosts;
every rule is wrapped in `<IfModule>` so it is safe if a module is missing.
