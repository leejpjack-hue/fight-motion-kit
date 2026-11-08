# HM-PF-17 — Product-flow camera cold open

Issue [#97](https://github.com/leejpjack-hue/fight-motion-kit/issues/97).

The product-flow sample page is [`public/product-flow.html`](../../public/product-flow.html),
served at `/product-flow.html`. Its **Open camera-grammar cold open** link opens
the existing `fight-cam-grammar-starter` directly. The composer also exposes an
**Open camera-grammar cold open** library action and keeps the original
**Templates → Fight cam grammar starter** path.

[Open the existing Workers sample](https://html-motion-composer.leejpjack.workers.dev/ui/?show=fight-cam-grammar-starter).
The sample is 11.00 seconds, with the following exact roles:

```text
Wide → Intent → Action → Reaction → Intent → Action → Reaction
     → Intent → Action → Reaction → Wide
```

The opening Wide uses `low_rise`; the re-establish uses `eye_orbit`. Every
preset already exists in `camera_presets.json`; no new `wide_*` curve or artwork
is introduced. The default 5.00-second eight-plate demo remains the default.

For a product-flow walkthrough: open the starter, scrub a triplet, select a clip
and tweak its preset or duration, then save/export locally. This path uses static
catalog/files and browser compose; there is no `/api/setup` success stub.

## Verification

With `npm run dev`:

```sh
node tests/grammar-starter.browser.cjs
```

Against the existing live Workers UI, using read-only requests:

```sh
TEST_BASE_URL=https://html-motion-composer.leejpjack.workers.dev \
  HM_PROOF_DIR=work/qa/grammar-workers \
  node tests/grammar-starter.browser.cjs
```

The check verifies the direct URL and Templates paths, exact role sequence,
three triplets/two Wides, the 11-second clock, scrub, and the 60-second Jack bar.
It refuses backend requests and records screenshot/JSON proof under ignored
`work/qa/`. The new static guide and new library action are verified locally;
they ship through the repository's normal publication process. This work does
not deploy or change Workers hosting.

Read-only Workers verification on 8 Nov 2026 observed three triplets, two Wides,
11.00 seconds, both entry paths and scrub in 5.03 seconds, with zero backend
requests or page errors. The local rhythm flow additionally verifies the new
product-flow guide link using the same sample assets.
