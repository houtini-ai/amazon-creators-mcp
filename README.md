<div align="center">
  <img src="https://raw.githubusercontent.com/houtini-ai/amazon-creators-mcp/main/assets/logo.png" width="120" height="120" alt="Amazon Creators MCP" />
</div>

# Amazon Creators API MCP - paste-ready affiliate product cards, straight from a chat

[![npm version](https://img.shields.io/npm/v/@houtini/amazon-creators-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@houtini/amazon-creators-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue?style=flat-square)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Known Vulnerabilities](https://snyk.io/test/github/houtini-ai/amazon-creators-mcp/badge.svg)](https://snyk.io/test/github/houtini-ai/amazon-creators-mcp)

If you write product round-ups, you already know the boring part. You find the product on Amazon, copy the image, grab the price, paste your affiliate link, and hope the price hasn't moved by the time someone reads the post. Then you do it again for the next nine products.

This does that part for you. You ask Claude to find something, it searches the live Amazon catalogue, and it hands you back a finished HTML card - image, price, savings, star rating, your Associates tag already baked into the link, and the disclosure footer Amazon requires. Paste it into WordPress, Ghost, Substack, whatever you write in. In Claude Desktop you even see the card render before you copy it.

Built on the **Amazon Creators API** - the REST API that replaced Product Advertising API 5.0 when Amazon retired the old endpoint on 15 May 2026. If your workflow still points at PA-API, it's been dead for a while now. This is the way back in.

<p align="center">
  <img src="images/example-grid.svg" alt="Three Amazon product cards in a responsive grid, each with an image, title, brand and star rating, price with retrieval timestamp, a savings line, and a yellow View on Amazon button, above the Associates disclosure" width="820" />
</p>
<p align="center"><em>One "make a grid of these" and you get this - styles inlined, tag in every link, disclosure at the bottom. Paste it and move on.</em></p>

> **Quick nav**
>
> [Who it's for](#who-its-for) · [How you'll actually use it](#how-youll-actually-use-it) · [Getting your API key](#getting-your-api-key) · [Install](#install) · [Environment variables](#environment-variables) · [Tools](#tools) · [Output formats](#output-formats) · [Styling](#styling-the-cards) · [Associates compliance](#associates-compliance) · [Troubleshooting](#troubleshooting)

---

## Who it's for

- **Affiliate bloggers and niche-site owners** who live in round-ups and "best X for Y" posts, and want the product embeds done in seconds instead of by hand.
- **Content and SEO teams** who need consistent, on-brand product cards across a lot of articles, without a developer wiring up the API each time.
- **Newsletter writers** on Substack, Ghost or beehiiv who just want clean HTML they can drop into an issue.
- **Anyone migrating off PA-API 5.0** who needs a working replacement now that the old endpoint is gone.

You don't need to know what an API is to use it - if you can add an MCP server to Claude and paste your Associates keys once, you're set. The [key bit](#getting-your-api-key) is having an eligible Associates account.

---

## How you'll use it

The whole thing is built around a conversation, not a form. You describe what you're writing about, Claude searches and summarises, and it only spits out HTML when you actually ask for the embed. Here's the shape of it.

### 1. Find products for a post

> *"Find me the best direct-drive racing wheels under £500"*

Claude runs `search_items` and comes back with a plain summary - no HTML yet:

> *Found 8 direct-drive wheels under £500. The ones worth a look:*
> *• Fanatec CSL DD (£349) - well reviewed, 5 Nm motor*
> *• Moza R5 Bundle (£469) - comes with pedals, 5.5 Nm*
> *• Cammus C5 (£399) - compact*
> *Want me to build an embeddable grid for these?*

### 2. Build the card or grid

> *"Yes, make a grid of the top three"*

Now it switches to `format: 'html-grid'` and returns a complete HTML document. Images, prices, savings, stars, your tag, the "as of" timestamp, the disclosure footer. All of it. Paste and you're done.

### 3. Restyle it without burning your rate limit

This is the bit that saves you. The Creators API has real rate limits (roughly a request a second to start with, climbing as you drive more sales), so you don't want to re-query Amazon every time you fancy a different colour. You don't have to. Claude keeps the data from the last call and re-renders locally:

> *"Same grid, but dark cards and hotpink buttons"*

```json
{
  "response": { "searchResult": { "items": [ /* from the previous call */ ] } },
  "format": "html-grid",
  "customStyles": ".amzn-card{background:#0f172a;color:#f1f5f9} .amzn-card__cta{background:hotpink;color:#111}"
}
```

Twenty style tweaks, zero extra API calls. Iterate on the look as much as you like.

### 4. Look up specific ASINs

> *"Get me the current details for B09B2SBHQK, B08N5M7S6K and B0BZC6YR7Q"*

Claude calls `get_items` and summarises the three. One thing worth knowing: the API doesn't promise to return items in the order you asked for them, and it quietly drops any ASIN it can't find (those land in a separate `errors` array). Claude matches on the `asin` field so you don't have to think about it.

### 5. List colour and size variations

> *"What colours does the Echo Show 5 come in?"*

That's `get_variations` - it lists the child products of a parent ASIN, each with its own price.

---

## Getting your API key

This is where most people get stuck, so I'll be straight with you: **the Creators API isn't open to everyone, and there's a sales gate.** Worth knowing before you spend an afternoon on it.

### What you need first

- An **approved Amazon Associates account** for the marketplace you're targeting (a `.com` account won't work against `.co.uk` - the credentials are tied to a region).
- **At least 10 qualifying shipped sales in the trailing 30 days.** This is the one that catches people. If your account dips under 10 sales across any rolling 30-day window, access gets suspended until you're back over the line. New or quiet accounts simply won't have API access yet.
- You have to be the **primary account owner**. Secondary users on an Associates account can't see the Creators API page or generate keys. In my experience this trips up teams more than anything else.
- **Node.js 20 or newer** on the machine running the MCP.

### Where to create the credentials

Sign in to [Associates Central](https://affiliate-program.amazon.com/), open the **Tools** menu, and pick **Creators API** - or just go straight to [affiliate-program.amazon.com/creatorsapi](https://affiliate-program.amazon.com/creatorsapi). Then it's three steps.

**1. Create a Creators API application**

![Associates Central Creators API page with the Create application button](images/creators-api-step-1-create-app.png)

**2. Name it and pick your region**

The region you choose here decides your `AMAZON_CREDENTIAL_VERSION` (NA = `3.1`, EU = `3.2`, FE = `3.3` - full table [below](#credential-version-by-region)). Pick the region that matches the marketplace you actually write for.

![Application creation form showing name, description and region selector](images/creators-api-step-2-application-name.png)

**3. Copy the Credential ID and Secret**

Amazon generates a Login with Amazon (v3.x) credential pair. Copy both - the ID goes in `AMAZON_CLIENT_ID`, the secret in `AMAZON_CLIENT_SECRET`. These never leave your own machine. The MCP server talks to Amazon directly; nothing is sent to Houtini or anyone else.

![Generated credentials screen with Credential ID and Secret fields](images/creators-api-step-3-credentials.png)

> **On older v2.x credentials:** if you set an app up before early 2026 you might have v2.x Cognito credentials lying around. They don't work here. Create a fresh Login with Amazon application to get v3.x keys - the server checks on startup and refuses v2.x with a message telling you exactly this, so you won't be left guessing.

---

## Install

You don't clone anything to use it - `npx` pulls the published package. You just need your five environment variables to hand.

### Claude Desktop

Open your config file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "amazon-creators": {
      "command": "npx",
      "args": ["-y", "@houtini/amazon-creators-mcp"],
      "env": {
        "AMAZON_CLIENT_ID": "amzn1.application-oa2-client.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "AMAZON_CLIENT_SECRET": "amzn1.oa2-cs.v1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "AMAZON_PARTNER_TAG": "yourtag-20",
        "AMAZON_CREDENTIAL_VERSION": "3.1",
        "AMAZON_MARKETPLACE": "www.amazon.com"
      }
    }
  }
}
```

Restart Claude Desktop, then say *"find me \[whatever you're writing about\] on Amazon"* and you're off.

### Claude Code (CLI)

```bash
claude mcp add \
  -e AMAZON_CLIENT_ID=amzn1.application-oa2-client.xxx \
  -e AMAZON_CLIENT_SECRET=amzn1.oa2-cs.v1.xxx \
  -e AMAZON_PARTNER_TAG=yourtag-20 \
  -e AMAZON_CREDENTIAL_VERSION=3.1 \
  -e AMAZON_MARKETPLACE=www.amazon.com \
  -s user amazon-creators -- npx -y @houtini/amazon-creators-mcp
```

Check it took with `claude mcp get amazon-creators` - you want to see `Status: Connected`.

---

## Environment variables

| Variable | Required | Example | Notes |
|---|---|---|---|
| `AMAZON_CLIENT_ID` | Yes | `amzn1.application-oa2-client.…` | "Credential Id" from your Creators API app |
| `AMAZON_CLIENT_SECRET` | Yes | `amzn1.oa2-cs.v1.…` | "Secret" from the same place |
| `AMAZON_PARTNER_TAG` | Yes | `yourtag-20` | Your Associates tracking ID |
| `AMAZON_CREDENTIAL_VERSION` | Yes | `3.1` / `3.2` / `3.3` | Region-specific - see table below |
| `AMAZON_MARKETPLACE` | Yes | `www.amazon.com` | The full marketplace host |
| `AMAZON_MAX_CONCURRENCY` | No | `4` | Max requests in flight at once. Default `4`. |
| `DEBUG` | No | `1` | Noisy stderr logging. Off by default. |

### Credential version by region

Your credentials are tied to one region, and calling a marketplace outside it fails auth - so the server cross-checks these at startup and stops you early rather than letting you find out mid-request.

| Region | Version | Marketplaces |
|---|---|---|
| **NA** | `3.1` | `www.amazon.com`, `www.amazon.ca`, `www.amazon.com.mx`, `www.amazon.com.br` |
| **EU** | `3.2` | `www.amazon.co.uk`, `www.amazon.de`, `www.amazon.fr`, `www.amazon.it`, `www.amazon.es`, `www.amazon.nl`, `www.amazon.com.be`, `www.amazon.eg`, `www.amazon.in`, `www.amazon.ie`, `www.amazon.pl`, `www.amazon.sa`, `www.amazon.se`, `www.amazon.com.tr`, `www.amazon.ae` |
| **FE** | `3.3` | `www.amazon.co.jp`, `www.amazon.sg`, `www.amazon.com.au` |

---

## Tools

| Tool | Input | What it does |
|---|---|---|
| `search_items` | `keywords` / `actor` / `author` / `brand` / `title` + filters | Search the catalogue. Max 10 items a page; page through with `itemPage`. |
| `get_items` | `asins: string[]` (1-10) | Look up specific ASINs. Match results on `asin`, not on the order you sent them. |
| `get_variations` | `asin: string` | The size / colour children of a parent ASIN. |
| `get_browse_nodes` | `browseNodeIds: string[]` | Category metadata and the ancestor chain. `json` / `markdown` only. |
| `format_items` | `response` *or* `items[]` from a prior call | Re-render data you already fetched. **Doesn't call Amazon.** This is how you restyle for free. |

The four Amazon-facing tools all take:

- **`format`** - `'json' | 'markdown' | 'html-card' | 'html-grid'` (default `markdown`; `get_browse_nodes` is `json | markdown` only)
- **`resources`** - which fields to pull, as camelCase paths (`itemInfo.title`, `offersV2.listings.price`). Leave it off for a sensible default set.
- **`customStyles`** - extra CSS tacked onto the built-in stylesheet when you're rendering HTML.
- **`titleMaxChars`** - cap the rendered title (default **80**). Amazon titles are often 150-plus characters of keyword soup, and 80 keeps a card to one line. Set `0` to turn it off. Markdown and JSON always get the full title.
- **`hideItemsWithoutPrice`** - for `html-grid`, drop anything with no price (default **true**). A card with no price is a weak embed - no hook, nothing to click for. Set `false` if you're building a comparison table where you want the product shown regardless.

---

## Output formats

- **`markdown`** - image, linked title, price, disclosure. Drops straight into a blog editor. Full untruncated titles.
- **`html-card`** - one self-contained `<article class="amzn-card">` with its styles inlined. Title capped at `titleMaxChars`. If there's no price, it renders a muted "Check price on Amazon" link so the card still has somewhere to click.
- **`html-grid`** - a responsive grid of those cards for a search or a list. No-price items dropped by default.
- **`json`** - the parsed response, pretty-printed. For when you want to see what Amazon actually sent.

If you'd rather not touch HTML at all, `markdown` is the friendliest. Ask for it and you get exactly this, ready to drop into a post:

```markdown
[![Fanatec CSL DD Direct Drive Wheel Base (5 Nm)](https://m.media-amazon.com/images/…jpg)](https://www.amazon.com/dp/B0EXAMPLE01?tag=yourtag-20)
**[Fanatec CSL DD Direct Drive Wheel Base (5 Nm)](https://www.amazon.com/dp/B0EXAMPLE01?tag=yourtag-20)**
Brand: Fanatec · 4.7★ (1,284 reviews)
**£349.95** — save £40.00 (10% off) _(as of 20 Jul 2026, 15:24 UTC)_
ASIN: `B0EXAMPLE01`

> *As an Amazon Associate we earn from qualifying purchases. Prices and availability are accurate as of the time shown and are subject to change.*
```

In Claude Desktop the card renders inline before you copy it, using the official MCP Apps protocol - a sandboxed preview so you're not pasting blind. On a host that doesn't do MCP Apps yet, you still get the HTML as plain text, which is the exact thing you paste anyway. Nothing lost.

---

## Styling the cards

Every visible bit of a card has a stable class hook, so you can restyle the whole thing through conversation without anyone touching the code:

```
.amzn-card                    .amzn-card__image              .amzn-card__title
.amzn-card__meta              .amzn-card__brand              .amzn-card__rating
.amzn-card__price             .amzn-card__price--unavailable .amzn-card__savings
.amzn-card__cta               .amzn-card__disclosure         .amzn-grid
```

So this works:

> *"Make the CTA hotpink and the card a dark rounded rectangle."*

```json
{
  "keywords": "coffee grinder",
  "format": "html-card",
  "customStyles": ".amzn-card{background:#0f172a;color:#f1f5f9;border-radius:20px} .amzn-card__cta{background:hotpink;color:#111}"
}
```

`customStyles` is appended after the default stylesheet, so your rules win on ordering. Match your site's look once, then reuse the same CSS on every render.

---

## Associates compliance

Displaying Amazon product data comes with rules, and it's your account on the line if you get them wrong. So the server bakes the boring-but-important bits in for you:

- Your `AMAZON_PARTNER_TAG` goes on every outbound link. It prefers the already-tagged `detailPageURL` Amazon returns, and falls back to a `/dp/ASIN?tag=…` link if it has to.
- Every link carries `rel="nofollow sponsored noopener"`.
- Whenever a price shows, so does the time it was retrieved (`as of <timestamp>`).
- Every card and grid ends with the Associates disclosure footer.

None of that is optional under the Associates Operating Agreement, which is exactly why it's automatic rather than something you have to remember.

---

## Development

```bash
git clone https://github.com/houtini-ai/amazon-creators-api-mcp
cd amazon-creators-api-mcp
npm install
npm run build
```

| Command | What it does |
|---------|--------------|
| `npm run build` | Build everything (viewer bundle + TypeScript) |
| `npm run build:viewer` | Just the MCP Apps viewer HTML bundle |
| `npm run dev` | Watch mode for the server TypeScript |
| `npm run test` | vitest (103 tests, unit + integration) |
| `npm run typecheck` | Types only, no emit |
| `npm run lint` | ESLint |

If you've got live credentials, `npx tsx scripts/smoke-auth.ts` runs a real token fetch plus one `searchItems` call - the quickest way to confirm your keys actually work end to end.

See [SCOPE.md](./SCOPE.md) for the architecture and the API quirks worth knowing.

---

## Troubleshooting

**"Credential version rejected" on startup** - you're on v2.x Cognito credentials. Create a fresh Login with Amazon app in Associates Central → Creators API, then set `AMAZON_CREDENTIAL_VERSION` to `3.1`, `3.2` or `3.3` for your region.

**401 or 403 errors** - usually one of two things. Either your Associates account doesn't have the 10 qualifying sales in the last 30 days, or Creators API access isn't switched on for the account yet. Both are checked in Associates Central.

**A region mismatch error at startup** - your credential version and your marketplace are in different regions (a `3.1` NA key pointed at `www.amazon.co.uk`, say). Use credentials issued for the same region as the marketplace you're calling.

**Preview images not showing in Claude Desktop** - the viewer only allowlists Amazon's own image CDNs. On a host with a stricter policy the preview images might not load, but the plain HTML output is fine - it renders once it's pasted into your site.

**"The items came back in the wrong order"** - that's expected. `get_items` can return items in any order and drops any ASIN it can't find into a separate `errors` array. Match on the `asin` field. Claude does this for you when it summarises.

---

## Licence

MIT. See [LICENSE](LICENSE).

---

Built by [Houtini](https://houtini.ai) for the Model Context Protocol community. Part of the houtini-ai MCP suite.
