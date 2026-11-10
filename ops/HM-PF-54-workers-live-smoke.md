# Smoke the Workers composer after a CoS or Jack gate

HM-PF-54 is how Development tips the live composer after a story ships. The tip is the live URL plus the smoke result. Do not invent a product direction in that note.

Open https://html-motion-composer.leejpjack.workers.dev/ui/

HM-PF-40 is already shipped. Leave `skills/html-motion-fight-video` as it is. This checklist does not rebuild it.

This page was written on `3790874a3d517a5b6f380547339acd9da51f9e59` (HM-PF-35 SHIP, #183). It replaces the copy written on `f159c4f295d559bab1d9362a7513b800480d57cc`. Cap-gate order is HM-PF-38, then HM-PF-39, then HM-PF-42, then HM-PF-46, then this checklist last. Do not merge this page ahead of those four. Jack t2552u keeps the tip Cap-free until noon. Do not launch a Cap. Do not issue GO 30a.

Cursor Cloud Agent may open the pull request that adds this page. Skip Jev. The story issue is https://github.com/leejpjack-hue/fight-motion-kit/issues/124

## Wait for the gate

This checklist is cap-gate last, after HM-PF-38, HM-PF-39, HM-PF-42, and HM-PF-46. Run the steps below only after CoS or Jack has gated the story and squash-merged it. Development does not merge. This page has no merge step.

If the gate has not happened, stop. Do not deploy. Do not run `wrangler deploy`. Do not start `composer/serve.py` and call that the live smoke.

## Open the Workers composer

Open https://html-motion-composer.leejpjack.workers.dev/ui/?show=daiyu-wang-five-seconds in a private window. A private window skips the IndexedDB draft in `html-motion-studio`, which can hide the shipped demo on a normal reload.

If that page does not load, stop and report the HTTP failure. Do not fall back to `api.teqcon.uk`. Do not use port 8770. Do not point the smoke at another host.

Static files on `html-motion-composer.leejpjack.workers.dev` are in scope. A compose request to any other host is a failure.

## Run the Jack bar

Compare the live footer with `public/ui/index.html` and `public/ui/app.js` on the gated commit. Copy the text you see. Do not rewrite it into a healthier sentence.

1. Wait until `#status` is no longer `Opening project…`. Record the exact footer text. A pass includes `All processing stays in your browser`. If the status names a remote engine, `api.teqcon.uk`, or port 8770, fail the smoke. Do not change hosts to make the line look healthy.

2. Click **Load 5-second fight**. Accept the replace prompt if it appears. Cancelling leaves `Kept the open project.` and is not a pass. The open show is `daiyu-wang-five-seconds`. The footer reads `Ready · 5.00s · All processing stays in your browser`. The clip pill reads `01 / 08`. Leave the shipped demo file unchanged.

3. On the selected clip, click **Replace plate**, choose one library image, change the **Camera motion** preset, and click **+0.1s**. The preview updates on the same page. Wait until the footer starts with `Ready` again. It then includes a duration, a plate count, and `All processing stays in your browser`. From the first paint of the page to that preview, stay inside 60 seconds.

4. Click **Play**. The playhead moves. Click **Play** again. The playhead stops. The button title is `Play / pause (Space)`. The address bar stays on the Workers host.

5. In DevTools Network, search for `teqcon` and for `8770`. Confirm that both counts are zero. The Jack bar does not need a successful `/api/compose`, `/api/save`, `/api/upload`, `/api/duplicate`, or `/api/import_pack`. Same-host reads of `/ui/`, `/shows/daiyu-wang-five-seconds.json`, `/catalog.json`, and plate images are expected. A 501 from `/api/compose` on this host, with `fe_only` true, is the unused stub in `src/worker.js`. Do not retry that call on `api.teqcon.uk`.

## Report the status you saw

Send CoS the exact `#status` text from step 1 and from step 3. Say whether the 5.00 second demo loaded, whether Play started and stopped, and whether any request left the Workers host for `api.teqcon.uk` or port 8770. Name pass or fail. On a fail, quote the status text and the blocked request. Do not invent a remote sync percent or a GPU meter. Do not claim the live host matches `3790874a3d517a5b6f380547339acd9da51f9e59` unless the gated squash says that commit is what the host serves.

## Leave the holds unchanged

Do not use this smoke to build or lift HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, issue #41 SFX, SG-01, voice, or 30a. n8n stays gates only. Do not change the composer runtime from this checklist.
